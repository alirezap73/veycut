// SPDX-License-Identifier: AGPL-3.0-or-later
//! Browser project operations backed by the shared project engine.
//!
//! JavaScript owns media blobs and their decoding. Imported metadata names a
//! stable browser media key, not a filesystem path this crate tries to open.
//! All methods return JSON envelopes; project documents retain native format.
use concat_core::frame::MAX_SIDE;
use concat_core::time::FrameRate;
use concat_project::{Command, DocumentSettings, Editor};
use serde::Deserialize;
use serde_json::{Value, json};
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_DOCUMENT_BYTES: usize = 8 * 1024 * 1024;
const MAX_MEDIA: usize = 128;
const MAX_CLIPS: usize = 512;
const MAX_TRACKS: usize = 64;
const MAX_TIMELINES: usize = 8;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateOptions {
    #[serde(default = "default_name")]
    name: String,
    #[serde(default = "default_width")]
    width: u32,
    #[serde(default = "default_height")]
    height: u32,
    #[serde(default = "default_rate")]
    rate_num: i64,
    #[serde(default = "default_den")]
    rate_den: i64,
}
fn default_name() -> String {
    "Untitled project".to_owned()
}
fn default_width() -> u32 {
    720
}
fn default_height() -> u32 {
    1280
}
fn default_rate() -> i64 {
    30
}
fn default_den() -> i64 {
    1
}

/// One browser editing session. Undo, ids and edit semantics belong to Editor.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct WebEditor {
    editor: Editor,
    name: String,
}

impl Default for WebEditor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl WebEditor {
    /// Creates an empty portrait session without accessing a browser or disk.
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new() -> Self {
        let options = CreateOptions {
            name: default_name(),
            width: default_width(),
            height: default_height(),
            rate_num: default_rate(),
            rate_den: default_den(),
        };
        Self {
            editor: Editor::with_video(settings(&options).video()),
            name: options.name,
        }
    }

    /// Replaces the session after validating name, dimensions and frame rate.
    pub fn create_project(&mut self, options_json: &str) -> String {
        if options_json.len() > MAX_REQUEST_BYTES {
            return error(
                "requestTooLarge",
                "Project settings exceed the browser request limit.",
            );
        }
        let Ok(options) = serde_json::from_str::<CreateOptions>(options_json) else {
            return error(
                "invalidSettings",
                "Project settings are not valid JSON settings.",
            );
        };
        if !valid_name(&options.name)
            || options.width < 2
            || options.height < 2
            || options.width > MAX_SIDE
            || options.height > MAX_SIDE
            || !options.width.is_multiple_of(2)
            || !options.height.is_multiple_of(2)
            || FrameRate::checked(options.rate_num, options.rate_den).is_none()
            || options.rate_num as f64 / options.rate_den as f64 > 240.0
        {
            return error(
                "invalidSettings",
                "Use a name of 1–128 characters, even dimensions up to 8192, and a valid frame rate up to 240.",
            );
        }
        self.editor = Editor::with_video(settings(&options).video());
        self.name = options.name;
        self.response(true, None)
    }

    /// Opens a native-format document; rejected documents leave this session intact.
    pub fn open_project(&mut self, document_json: &str) -> String {
        if document_json.len() > MAX_DOCUMENT_BYTES {
            return error(
                "documentTooLarge",
                "The project exceeds the browser document limit.",
            );
        }
        let Ok(document) = serde_json::from_str::<Value>(document_json) else {
            return error("invalidProject", "The project is not valid JSON.");
        };
        let name = document
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("Untitled project");
        if !valid_name(name) {
            return error(
                "invalidProject",
                "The project name must contain 1–128 characters.",
            );
        }
        let Some(editor) = Editor::from_document(&document) else {
            return error(
                "invalidProject",
                "The shared engine could not open this project format.",
            );
        };
        if !within_capacity(&editor) {
            return error(
                "projectCapacity",
                "This project exceeds browser media, clip, track or timeline limits.",
            );
        }
        let restored = editor.to_document(&document_settings(name, &editor));
        if encoded_len(&restored) > MAX_DOCUMENT_BYTES {
            return error(
                "documentTooLarge",
                "The restored project exceeds the browser document limit.",
            );
        }
        self.editor = editor;
        self.name = name.to_owned();
        self.response(true, None)
    }

    /// Applies one supported native command, preserving the engine's atomicity and history.
    /// Supported ops: addMedia, addClip, splitClips, trimClip, moveClips,
    /// updateClip, removeClips, addTextClip and addTrack. A batch of up to 32
    /// direct supported commands is one atomic edit; nested batches are refused.
    pub fn apply_command(&mut self, command_json: &str) -> String {
        if command_json.len() > MAX_REQUEST_BYTES {
            return error(
                "requestTooLarge",
                "The edit exceeds the browser request limit.",
            );
        }
        let Ok(command) = serde_json::from_str::<Command>(command_json) else {
            return error(
                "invalidCommand",
                "The edit is not a valid shared-engine command.",
            );
        };
        let commands: Vec<&Command> = if let Command::Batch { commands } = &command {
            if commands.len() > 32 {
                return error(
                    "requestCapacity",
                    "A browser batch supports at most 32 edits.",
                );
            }
            commands.iter().collect()
        } else {
            vec![&command]
        };
        let mut media = self.editor.project().media.len();
        let mut clips = clip_count(&self.editor);
        let mut tracks = track_count(&self.editor);
        let mut additional = 4096usize;
        for edit in commands {
            match edit {
                Command::AddMedia { item } => {
                    if item.path.is_empty()
                        || item.path.len() > 1024
                        || item.name.chars().count() > 256
                        || item
                            .duration
                            .is_some_and(|seconds| !seconds.is_finite() || seconds <= 0.0)
                    {
                        return error(
                            "invalidMedia",
                            "Use a stable media key, a short display name and a positive duration when known.",
                        );
                    }
                    media += 1;
                }
                Command::AddClip { .. } => clips += 1,
                Command::AddTextClip { .. } => {
                    clips += 1;
                    // The shared placement policy may create a lane.
                    tracks += 1;
                }
                Command::SplitClips { clip_ids, .. } => {
                    clips = clips.saturating_add(clip_ids.len());
                    let growth = self
                        .editor
                        .project()
                        .active()
                        .clips
                        .iter()
                        .filter(|clip| clip_ids.contains(&clip.id))
                        .map(|clip| {
                            serde_json::to_vec(clip)
                                .map_or(MAX_DOCUMENT_BYTES, |v| v.len().saturating_mul(2))
                        })
                        .fold(0usize, usize::saturating_add);
                    additional = additional.saturating_add(growth);
                }
                Command::AddTrack { .. } => tracks += 1,
                Command::TrimClip { .. }
                | Command::MoveClips { .. }
                | Command::UpdateClip { .. }
                | Command::RemoveClips { .. } => {}
                _ => {
                    return error(
                        "unsupportedCommand",
                        "This operation is not enabled in the browser editor; batches cannot be nested.",
                    );
                }
            }
            additional = additional.saturating_add(command_json.len().saturating_mul(2) + 4096);
        }
        if media > MAX_MEDIA || clips > MAX_CLIPS || tracks > MAX_TRACKS {
            return error(
                "projectCapacity",
                "The edit exceeds browser limits of 128 media items, 512 clips or 64 tracks.",
            );
        }
        // Reserve room for flat timeline mirrors and default properties before
        // touching history. A rejected save-size budget never consumes an Undo.
        if encoded_len(&self.document()).saturating_add(additional) > MAX_DOCUMENT_BYTES {
            return error(
                "documentTooLarge",
                "The edit would exceed the browser document limit.",
            );
        }
        match self.editor.apply(command) {
            Ok(outcome) => self.response(outcome.applied, outcome.created_id),
            Err(reason) => error("commandRejected", &reason.to_string()),
        }
    }

    /// Undoes the latest real shared-engine edit.
    pub fn undo(&mut self) -> String {
        let applied = self.editor.undo();
        self.response(applied, None)
    }

    /// Replays the latest undone real shared-engine edit.
    pub fn redo(&mut self) -> String {
        let applied = self.editor.redo();
        self.response(applied, None)
    }

    /// Returns the current document and history availability without mutation.
    pub fn snapshot(&self) -> String {
        self.response(false, None)
    }

    /// Returns a native-format document for the caller to persist or download.
    /// This method does not claim that browser storage succeeded.
    pub fn save_project(&self) -> String {
        self.response(false, None)
    }
}

impl WebEditor {
    fn document(&self) -> Value {
        self.editor
            .to_document(&document_settings(&self.name, &self.editor))
    }
    fn response(&self, applied: bool, created_id: Option<String>) -> String {
        encode(json!({
            "ok": true, "document": self.document(), "canUndo": self.editor.can_undo(),
            "canRedo": self.editor.can_redo(), "applied": applied, "createdId": created_id
        }))
    }
}

fn settings(options: &CreateOptions) -> DocumentSettings {
    DocumentSettings {
        name: options.name.clone(),
        width: options.width,
        height: options.height,
        rate_num: options.rate_num,
        rate_den: options.rate_den,
    }
}
fn document_settings(name: &str, editor: &Editor) -> DocumentSettings {
    let video = editor.project().active().video;
    DocumentSettings {
        name: name.to_owned(),
        width: video.width,
        height: video.height,
        rate_num: video.rate_num,
        rate_den: video.rate_den,
    }
}
fn valid_name(name: &str) -> bool {
    !name.trim().is_empty() && name.chars().count() <= 128
}
fn clip_count(editor: &Editor) -> usize {
    editor
        .project()
        .timelines
        .iter()
        .map(|timeline| timeline.clips.len())
        .sum()
}
fn track_count(editor: &Editor) -> usize {
    editor
        .project()
        .timelines
        .iter()
        .map(|timeline| timeline.tracks.len())
        .sum()
}
fn within_capacity(editor: &Editor) -> bool {
    editor.project().media.len() <= MAX_MEDIA
        && clip_count(editor) <= MAX_CLIPS
        && track_count(editor) <= MAX_TRACKS
        && editor.project().timelines.len() <= MAX_TIMELINES
}
fn encoded_len(value: &Value) -> usize {
    serde_json::to_vec(value).map_or(usize::MAX, |bytes| bytes.len())
}
fn encode(value: Value) -> String {
    serde_json::to_string(&value).unwrap_or_else(|_| r#"{"ok":false,"error":{"code":"internalError","message":"Could not serialize the engine response."}}"#.to_owned())
}
fn error(code: &str, message: &str) -> String {
    encode(json!({"ok": false, "error": {"code": code, "message": message}}))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn response(text: String) -> Value {
        serde_json::from_str(&text).expect("JSON response")
    }
    fn apply(editor: &mut WebEditor, value: Value) -> Value {
        let result = response(editor.apply_command(&value.to_string()));
        assert_eq!(result["ok"], true, "{result}");
        result
    }
    fn imported(editor: &mut WebEditor) -> String {
        let result = apply(
            editor,
            json!({"op":"addMedia","item":{
                "path":"browser:fixture","name":"Portrait sample","kind":"video",
                "duration":6.0,"width":720,"height":1280,"frameRate":30.0,
                "frameRateFraction":"30/1","hasAudio":true
            }}),
        );
        result["createdId"].as_str().expect("media id").to_owned()
    }

    #[test]
    fn browser_sequence_uses_engine_source_continuity_history_and_native_roundtrip() {
        let mut editor = WebEditor::new();
        assert_eq!(
            response(editor.create_project(r#"{"name":"سلام VeyCut","width":720,"height":1280}"#))["ok"],
            true
        );
        let media_id = imported(&mut editor);
        let added = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media_id,"trackId":"T1","start":0}),
        );
        let clip_id = added["createdId"].as_str().unwrap();
        let split = apply(
            &mut editor,
            json!({"op":"splitClips","clipIds":[clip_id],"time":3.0}),
        );
        let pieces = split["document"]["clips"].as_array().unwrap();
        assert_eq!(pieces.len(), 2);
        assert_eq!(pieces[0]["duration"], 3.0);
        assert_eq!(pieces[1]["start"], 3.0);
        assert_eq!(pieces[1]["sourceStart"], 3.0);
        let original_split = split["document"].clone();
        apply(
            &mut editor,
            json!({"op":"trimClip","clipId":clip_id,"edge":"end","delta":-1.0}),
        );
        assert_eq!(
            response(editor.snapshot())["document"]["clips"][0]["duration"],
            2.0
        );
        assert_eq!(response(editor.undo())["document"], original_split);
        assert_eq!(
            response(editor.undo())["document"]["clips"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(response(editor.redo())["document"], original_split);
        let after_trim = response(editor.redo());
        let saved = response(editor.save_project())["document"].clone();
        assert_eq!(saved, after_trim["document"]);
        let mut reopened = WebEditor::new();
        let opened = response(reopened.open_project(&saved.to_string()));
        assert_eq!(opened["ok"], true);
        assert_eq!(opened["document"], saved);
        assert_eq!(opened["canUndo"], false);
        assert_eq!(opened["canRedo"], false);
    }

    #[test]
    fn browser_failures_preserve_project_history_and_ids() {
        let mut editor = WebEditor::new();
        imported(&mut editor);
        let before = response(editor.snapshot());
        for invalid in [
            json!({"op":"addClip","mediaId":"missing","trackId":"T1","start":0}),
            json!({"op":"batch","commands":[{"op":"batch","commands":[]}]}),
        ] {
            assert_eq!(
                response(editor.apply_command(&invalid.to_string()))["ok"],
                false
            );
            assert_eq!(response(editor.snapshot()), before);
        }
        for settings in [
            r#"{"width":8194}"#,
            r#"{"rateNum":0}"#,
            r#"{"rateDen":-1}"#,
            r#"{"name":" "}"#,
            r#"{"height":721}"#,
            r#"{"width":2,"rateNum":241}"#,
        ] {
            assert_eq!(response(editor.create_project(settings))["ok"], false);
            assert_eq!(response(editor.snapshot()), before);
        }
        assert_eq!(
            response(editor.open_project(r#"{"version":999,"clips":[]}"#))["ok"],
            false
        );
        assert_eq!(response(editor.snapshot()), before);
        assert_eq!(
            response(editor.apply_command(&" ".repeat(MAX_REQUEST_BYTES + 1)))["error"]["code"],
            "requestTooLarge"
        );
        assert_eq!(response(editor.snapshot()), before);
        let next = apply(
            &mut editor,
            json!({"op":"addMedia","item":{
                "path":"browser:next","name":"Next","kind":"video","duration":2.0,"hasAudio":false
            }}),
        );
        assert_eq!(next["createdId"], "m2");
    }

    #[test]
    fn browser_atomic_batch_trims_moves_and_rolls_back_invalid_edits() {
        let mut editor = WebEditor::new();
        let media = imported(&mut editor);
        let added = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media,"trackId":"T1","start":0}),
        );
        let id = added["createdId"].as_str().unwrap();
        let baseline = added["document"].clone();
        let trimmed = apply(
            &mut editor,
            json!({"op":"batch","commands":[
                {"op":"trimClip","clipId":id,"edge":"start","delta":1.0},
                {"op":"trimClip","clipId":id,"edge":"end","delta":-1.0},
                {"op":"moveClips","moves":[{"clipId":id,"start":0.0,"trackId":"T1"}]}
            ]}),
        );
        assert_eq!(trimmed["document"]["clips"][0]["start"], 0.0);
        assert_eq!(trimmed["document"]["clips"][0]["sourceStart"], 1.0);
        assert_eq!(trimmed["document"]["clips"][0]["duration"], 4.0);
        assert_eq!(response(editor.undo())["document"], baseline);
        assert_eq!(response(editor.redo())["document"], trimmed["document"]);
        let before_failure = response(editor.snapshot());
        let failure = response(
            editor.apply_command(
                &json!({"op":"batch","commands":[
                    {"op":"trimClip","clipId":id,"edge":"end","delta":-1.0},
                    {"op":"addClip","mediaId":"missing","trackId":"T1","start":0}
                ]})
                .to_string(),
            ),
        );
        assert_eq!(failure["error"]["code"], "commandRejected");
        assert_eq!(response(editor.snapshot()), before_failure);
    }

    #[test]
    fn browser_split_capacity_rejection_does_not_consume_undo() {
        let mut editor = WebEditor::new();
        let media_id = imported(&mut editor);
        let clip = apply(
            &mut editor,
            json!({"op":"addClip","mediaId":media_id,"trackId":"T1","start":0}),
        );
        let clip_id = clip["createdId"].as_str().unwrap();
        let before = response(editor.snapshot());
        let result = response(
            editor.apply_command(
                &json!({
                    "op":"splitClips","clipIds":vec![clip_id;MAX_CLIPS],"time":3
                })
                .to_string(),
            ),
        );
        assert_eq!(result["error"]["code"], "projectCapacity");
        assert_eq!(response(editor.snapshot()), before);
        assert_eq!(response(editor.undo())["document"]["clips"], json!([]));
    }
}
