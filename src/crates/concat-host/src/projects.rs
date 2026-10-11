// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer and Concat contributors

//! Project folders on disk, and the list of recently opened ones.
//!
//! A project is a directory containing `concat.json`. That file is written the
//! moment the project is created, so a project is a real thing from the start
//! rather than a promise the app keeps only if you remember to save.
//!
//! The recents list lives in the app's config directory, not in any project.
//! It describes this machine's history, and copying a project folder to
//! another machine should not drag one person's recent files along with it.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

const MANIFEST: &str = "concat.json";
/// The manifest's earlier names, newest first. Projects created before a
/// rename keep theirs forever: the manifest is read and written under the
/// name it has, and only brand-new projects get the current one. A rename
/// must never orphan an edit.
const LEGACY_MANIFESTS: &[&str] = &["wolfcut.json"];

/// The manifest file this project actually uses: the current name, a legacy
/// name if that is what exists, the current name for a fresh folder.
pub fn manifest_path(root: &Path) -> PathBuf {
    let current = root.join(MANIFEST);
    if current.is_file() {
        return current;
    }
    for legacy in LEGACY_MANIFESTS {
        let candidate = root.join(legacy);
        if candidate.is_file() {
            return candidate;
        }
    }
    current
}

/// Whether `root` holds a project: any manifest, current or legacy.
pub fn is_project(root: &Path) -> bool {
    manifest_path(root).is_file()
}

const RECENTS: &str = "recents.json";
/// Long enough to be useful, short enough that the list stays scannable.
const MAX_RECENTS: usize = 12;

/// Everything needed to reopen a project.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    /// The project folder.
    pub path: String,
    /// The name shown in the title bar and the recents list.
    pub name: String,
    /// Output width in pixels.
    pub width: u32,
    /// Output height in pixels.
    pub height: u32,
    /// Frame rate as an exact fraction; the decimal is never stored.
    pub rate_num: i64,
    /// Denominator of the frame rate.
    pub rate_den: i64,
    /// Milliseconds since the epoch.
    pub opened_at: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    /// The version of the app that wrote the file, under whichever name the
    /// app had at the time. Informational: nothing reads it back.
    #[serde(alias = "wolfcut")]
    concat: String,
    name: String,
    video: Video,
    /// Everything else in the file is ignored when reading settings for the
    /// recents list. `flatten` keeps it from being dropped on a rewrite.
    #[serde(flatten)]
    #[allow(dead_code)]
    rest: serde_json::Map<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Video {
    width: u32,
    height: u32,
    rate_num: i64,
    rate_den: i64,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

/// Creates the project folder and writes its manifest.
///
/// Refuses to touch a folder that already holds a manifest. Overwriting
/// someone's edit because they reused a name is not a recoverable mistake.
pub fn create(
    location: &str,
    name: &str,
    width: u32,
    height: u32,
    rate_num: i64,
    rate_den: i64,
) -> Result<ProjectInfo, String> {
    let root = Path::new(location).join(folder_name(name));
    let manifest = root.join(MANIFEST);

    // Any name counts as an existing project - a legacy folder must be
    // just as safe from being clobbered as a new one.
    if is_project(&root) {
        return Err(format!(
            "a Concat project already exists at {}",
            root.display()
        ));
    }

    std::fs::create_dir_all(&root)
        .map_err(|error| format!("could not create {}: {error}", root.display()))?;

    // Settings only: a fresh project has no edit yet. The full document -
    // timelines included - is written by the session's save from the first
    // change.
    let document = Manifest {
        concat: env!("CARGO_PKG_VERSION").to_owned(),
        name: name.to_owned(),
        video: Video {
            width,
            height,
            rate_num,
            rate_den,
        },
        rest: serde_json::Map::new(),
    };

    let encoded = serde_json::to_vec_pretty(&document)
        .map_err(|error| format!("could not encode the manifest: {error}"))?;
    std::fs::write(&manifest, encoded)
        .map_err(|error| format!("could not write {}: {error}", manifest.display()))?;

    Ok(ProjectInfo {
        path: root.to_string_lossy().into_owned(),
        name: name.to_owned(),
        width,
        height,
        rate_num,
        rate_den,
        opened_at: now_millis(),
    })
}

/// Orders the window's save snapshots before they enter its worker pool.
/// New requests supersede queued older work without waiting for disk I/O;
/// publication is serialized, including synchronous saves during close.
#[derive(Clone, Default)]
pub struct SaveQueue {
    state: std::sync::Arc<SaveState>,
}

#[derive(Default)]
struct SaveState {
    latest: std::sync::atomic::AtomicU64,
    writing: std::sync::Mutex<()>,
}

/// A reserved save, safe to send to a worker or write synchronously on close.
pub struct PendingSave {
    queue: SaveQueue,
    revision: u64,
    path: String,
    document: serde_json::Value,
}

impl SaveQueue {
    /// Reserves this snapshot in UI request order, before worker scheduling.
    pub fn prepare(&self, path: String, document: serde_json::Value) -> PendingSave {
        let revision = self
            .state
            .latest
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
            .wrapping_add(1);
        PendingSave {
            queue: self.clone(),
            revision,
            path,
            document,
        }
    }

    /// Whether a completion still represents the latest requested save.
    pub fn is_current(&self, revision: u64) -> bool {
        self.state.latest.load(std::sync::atomic::Ordering::SeqCst) == revision
    }
}

impl PendingSave {
    /// The request number, used to ignore superseded worker completions.
    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Writes the snapshot, or returns false if a newer request superseded it.
    /// The write lock spans publication, including synchronous close saves.
    pub fn write(self) -> Result<bool, String> {
        let _writing = self
            .queue
            .state
            .writing
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if !self.queue.is_current(self.revision) {
            return Ok(false);
        }
        save(&self.path, &self.document).map(|()| true)
    }
}

/// Removes only this save's unpublished staging file on any error.
struct SaveFile(PathBuf);
impl Drop for SaveFile {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// Writes the whole project document to the project's manifest.
///
/// The document is passed through as opaque JSON rather than being mirrored
/// into Rust types: the engine (`concat-project`) owns the canonical model and
/// produced this document, and the host has no decisions to make about its
/// contents beyond writing it safely.
///
/// Written to a temporary file and renamed into place, because a save
/// interrupted halfway is worse than no save at all - a truncated manifest
/// loses the project, while a failed rename leaves the previous one intact.
pub fn save(path: &str, document: &serde_json::Value) -> Result<(), String> {
    let root = PathBuf::from(path);
    let manifest = manifest_path(&root);

    std::fs::create_dir_all(&root)
        .map_err(|error| format!("could not create {}: {error}", root.display()))?;

    let encoded = serde_json::to_vec_pretty(document)
        .map_err(|error| format!("could not encode the project: {error}"))?;

    // Written, then flushed to the disk, then renamed: a rename is only
    // atomic over bytes that have reached the platter. Without the sync a
    // power cut after the rename can leave a zero-length manifest.
    static NEXT_SAVE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let (temporary, mut file) = loop {
        let id = NEXT_SAVE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let candidate = root.join(format!(".veycut-save-{}-{id}.tmp", std::process::id()));
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => break (SaveFile(candidate), file),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("could not prepare project save: {error}")),
        }
    };
    std::io::Write::write_all(&mut file, &encoded)
        .map_err(|error| format!("could not write {}: {error}", temporary.0.display()))?;
    file.sync_all()
        .map_err(|error| format!("could not flush {}: {error}", temporary.0.display()))?;
    drop(file);

    std::fs::rename(&temporary.0, &manifest)
        .map_err(|error| format!("could not replace {}: {error}", manifest.display()))
}

/// True when a document carries no edit state at all - the settings-only
/// manifest `create` writes, in a project closed before its first save.
/// Such a document is a legitimately empty project. A document that claims
/// edit state the build then cannot load is a different thing: corrupt.
pub fn is_settings_only(document: &serde_json::Value) -> bool {
    document.is_object()
        && ["timelines", "tracks", "clips", "media"]
            .iter()
            .all(|key| document.get(key).is_none())
}

/// Reads the whole project document back: `None` when the folder has no
/// document yet, an error for one that is there and cannot be read or
/// parsed. The two are kept apart because a caller that treats them alike
/// opens a half-written document as an empty project and saves over it
/// (audit 2026-09-23, #1).
pub fn read_document(path: &str) -> Result<Option<serde_json::Value>, String> {
    let manifest = manifest_path(Path::new(path));
    let bytes = match std::fs::read(&manifest) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("could not read {}: {error}", manifest.display())),
    };
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|error| format!("{} is not a Concat project: {error}", manifest.display()))
}

/// Reads an existing project's settings.
pub fn open(path: &str) -> Result<ProjectInfo, String> {
    let root = PathBuf::from(path);
    let manifest = manifest_path(&root);

    let bytes = std::fs::read(&manifest)
        .map_err(|error| format!("could not read {}: {error}", manifest.display()))?;
    let document: Manifest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("{} is not a Concat project: {error}", manifest.display()))?;

    if document.video.rate_den == 0 {
        return Err(format!("{} has an invalid frame rate", manifest.display()));
    }

    Ok(ProjectInfo {
        path: root.to_string_lossy().into_owned(),
        name: document.name,
        width: document.video.width,
        height: document.video.height,
        rate_num: document.video.rate_num,
        rate_den: document.video.rate_den,
        opened_at: now_millis(),
    })
}

/// Moves a project to the front of the recents list.
pub fn remember(config: &Path, project: &ProjectInfo) -> Result<(), String> {
    let mut entries = read_recents(config);
    entries.retain(|entry| !same_path(&entry.path, &project.path));
    entries.insert(0, project.clone());
    entries.truncate(MAX_RECENTS);
    write_recents(config, &entries)
}

/// The recents list, most recent first, with vanished folders dropped.
///
/// Filtering on read rather than pruning on write means a project on a drive
/// that happens to be unplugged comes back when the drive does.
pub fn list(config: &Path) -> Vec<ProjectInfo> {
    read_recents(config)
        .into_iter()
        .filter(|entry| is_project(Path::new(&entry.path)))
        .collect()
}

/// Removes one project from the list. The folder itself is left alone.
pub fn forget(config: &Path, path: &str) -> Result<(), String> {
    let mut entries = read_recents(config);
    entries.retain(|entry| !same_path(&entry.path, path));
    write_recents(config, &entries)
}

fn read_recents(config: &Path) -> Vec<ProjectInfo> {
    // A missing or corrupt list is not an error worth showing anyone; it just
    // means there is no history yet.
    std::fs::read(config.join(RECENTS))
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_recents(config: &Path, entries: &[ProjectInfo]) -> Result<(), String> {
    std::fs::create_dir_all(config)
        .map_err(|error| format!("could not create {}: {error}", config.display()))?;

    let encoded = serde_json::to_vec_pretty(entries)
        .map_err(|error| format!("could not encode the recents list: {error}"))?;
    std::fs::write(config.join(RECENTS), encoded)
        .map_err(|error| format!("could not write the recents list: {error}"))
}

/// Compares paths case-insensitively, because Windows does, and on Windows
/// with either slash, because a path typed or joined with `/` names the same
/// folder as the one the file dialog hands back with `\`. A trailing
/// separator names the same folder too.
fn same_path(left: &str, right: &str) -> bool {
    fn spelled(path: &str) -> String {
        let path = if cfg!(windows) {
            path.replace('/', "\\")
        } else {
            path.to_owned()
        };
        path.trim_end_matches(['/', '\\']).to_owned()
    }
    spelled(left).eq_ignore_ascii_case(&spelled(right))
}

/// Turns a project name into something a filesystem will accept. Also used
/// for template bundle folders and the files inside them.
pub fn folder_name(name: &str) -> String {
    let cleaned: String = name
        .trim()
        .chars()
        .map(|character| {
            if character.is_control() || r#"<>:"/\|?*"#.contains(character) {
                '-'
            } else {
                character
            }
        })
        .collect();

    // Windows refuses names ending in a dot or a space.
    let trimmed = cleaned.trim_matches(['.', ' ']);
    if trimmed.is_empty() {
        "Untitled project".to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Removes all cached artwork and waveforms from a project folder.
///
/// The cache is entirely regenerable, so the whole folder goes, subfolders
/// (`art/`, peaks and all) included. `remove_file` alone would skip them:
/// it refuses directories.
pub fn clear_cache(path: &str) -> Result<usize, String> {
    let cache_dir = Path::new(path).join("cache");
    if !cache_dir.exists() {
        return Ok(0);
    }
    let count = count_files(&cache_dir);
    std::fs::remove_dir_all(&cache_dir)
        .map_err(|error| format!("cannot remove {}: {error}", cache_dir.display()))?;
    Ok(count)
}

/// Recursively counts the files under a directory, for the clear-cache toast.
fn count_files(dir: &Path) -> usize {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .filter_map(|entry| entry.ok())
        .map(|entry| {
            let path = entry.path();
            if path.is_dir() { count_files(&path) } else { 1 }
        })
        .sum()
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_queued_older_save_cannot_overwrite_the_close_snapshot() {
        let scratch =
            std::env::temp_dir().join(format!("veycut-save-order-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&scratch);
        let queue = SaveQueue::default();
        let old = queue.prepare(
            scratch.to_string_lossy().into_owned(),
            serde_json::json!({"edit": "older"}),
        );
        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            ready_tx.send(()).unwrap();
            release_rx.recv().unwrap();
            old.write()
        });
        ready_rx.recv().unwrap();
        let latest = queue.prepare(
            scratch.to_string_lossy().into_owned(),
            serde_json::json!({"edit": "close", "captions": ["سلام", "latest"]}),
        );
        assert!(latest.write().unwrap());
        release_tx.send(()).unwrap();
        assert!(!worker.join().unwrap().unwrap());
        assert_eq!(
            read_document(&scratch.to_string_lossy()).unwrap().unwrap(),
            serde_json::json!({"edit": "close", "captions": ["سلام", "latest"]})
        );
        assert_eq!(std::fs::read_dir(&scratch).unwrap().count(), 1);
        std::fs::remove_dir_all(scratch).unwrap();
    }

    #[test]
    fn a_new_snapshot_can_be_reserved_while_publication_is_busy() {
        let scratch = std::env::temp_dir().join(format!("veycut-save-busy-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&scratch);
        let queue = SaveQueue::default();
        let older = queue.prepare(
            scratch.to_string_lossy().into_owned(),
            serde_json::json!({"edit": "older"}),
        );
        // Hold the publication gate to model a slow disk. Reservation and
        // completion checks must remain responsive while that gate is busy.
        let writing = queue.state.writing.lock().unwrap();
        let other = queue.clone();
        let path = scratch.to_string_lossy().into_owned();
        let (sender, receiver) = std::sync::mpsc::channel();
        let worker = std::thread::spawn(move || {
            let pending = other.prepare(path, serde_json::json!({"edit": "newest"}));
            let current = other.is_current(pending.revision());
            sender.send((pending, current)).unwrap();
        });
        let prepared = receiver.recv_timeout(std::time::Duration::from_secs(5));
        drop(writing);
        worker.join().unwrap();
        let (newest, current) =
            prepared.expect("reserving a snapshot must not wait for disk publication");
        assert!(current);
        assert!(!older.write().unwrap());
        assert!(newest.write().unwrap());
        assert_eq!(
            read_document(&scratch.to_string_lossy()).unwrap().unwrap(),
            serde_json::json!({"edit": "newest"})
        );
        std::fs::remove_dir_all(scratch).unwrap();
    }

    #[test]
    fn failed_save_preserves_the_previous_document_and_allows_retry() {
        let scratch =
            std::env::temp_dir().join(format!("veycut-save-failure-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&scratch);
        save(
            &scratch.to_string_lossy(),
            &serde_json::json!({"edit": "saved"}),
        )
        .unwrap();
        let manifest = scratch.join(MANIFEST);
        let backup = scratch.join("previous.json");
        std::fs::rename(&manifest, &backup).unwrap();
        // A directory at the destination deterministically refuses publication,
        // including when tests run as root; no chmod or disk-full simulation.
        std::fs::create_dir(&manifest).unwrap();
        let queue = SaveQueue::default();
        let document = serde_json::json!({"edit": "new unsaved edit"});
        assert!(
            queue
                .prepare(scratch.to_string_lossy().into_owned(), document.clone())
                .write()
                .is_err()
        );
        assert_eq!(
            serde_json::from_slice::<serde_json::Value>(&std::fs::read(&backup).unwrap()).unwrap(),
            serde_json::json!({"edit": "saved"})
        );
        assert_eq!(
            std::fs::read_dir(&scratch).unwrap().count(),
            2,
            "failed save cleans its staging file"
        );
        std::fs::remove_dir(&manifest).unwrap();
        std::fs::rename(&backup, &manifest).unwrap();
        assert!(
            queue
                .prepare(scratch.to_string_lossy().into_owned(), document.clone())
                .write()
                .unwrap()
        );
        assert_eq!(
            read_document(&scratch.to_string_lossy()).unwrap().unwrap(),
            document
        );
        assert_eq!(std::fs::read_dir(&scratch).unwrap().count(), 1);
        std::fs::remove_dir_all(scratch).unwrap();
    }

    #[test]
    fn sanitises_names_windows_would_reject() {
        assert_eq!(folder_name("My: Project?"), "My- Project-");
        assert_eq!(folder_name("  trailing.  "), "trailing");
        assert_eq!(folder_name("..."), "Untitled project");
        assert_eq!(folder_name(""), "Untitled project");
    }

    #[test]
    fn a_legacy_manifest_keeps_its_name() {
        for legacy in LEGACY_MANIFESTS {
            let scratch = std::env::temp_dir().join(format!("concat-legacy-{legacy}-test"));
            let _ = std::fs::remove_dir_all(&scratch);
            std::fs::create_dir_all(&scratch).expect("scratch dir");
            // A fresh folder resolves to the current name...
            assert!(manifest_path(&scratch).ends_with(MANIFEST));
            assert!(!is_project(&scratch));
            // ...a pre-rename project keeps the manifest it has, forever...
            std::fs::write(scratch.join(legacy), b"{}").expect("writes");
            assert!(manifest_path(&scratch).ends_with(legacy));
            assert!(is_project(&scratch));
            // ...and the current name wins only where it actually exists.
            std::fs::write(scratch.join(MANIFEST), b"{}").expect("writes");
            assert!(manifest_path(&scratch).ends_with(MANIFEST));
            let _ = std::fs::remove_dir_all(&scratch);
        }
    }

    #[test]
    fn a_manifest_under_any_of_its_names_opens() {
        let scratch = std::env::temp_dir().join("concat-manifest-key-test");
        let _ = std::fs::remove_dir_all(&scratch);
        std::fs::create_dir_all(&scratch).expect("scratch dir");
        for key in ["concat", "wolfcut"] {
            let document = serde_json::json!({
                key: "0.2.0",
                "name": "Old",
                "video": { "width": 1920, "height": 1080, "rateNum": 30, "rateDen": 1 },
            });
            std::fs::write(
                scratch.join(MANIFEST),
                serde_json::to_vec(&document).unwrap(),
            )
            .expect("writes");
            let info = open(&scratch.to_string_lossy()).expect("opens");
            assert_eq!((info.width, info.height, info.rate_num), (1920, 1080, 30));
        }
        let _ = std::fs::remove_dir_all(&scratch);
    }

    #[test]
    fn a_fresh_manifest_is_settings_only_and_a_saved_edit_is_not() {
        // Exactly what `create` writes: settings, no edit state.
        let fresh = serde_json::json!({
            "concat": "0.2.0",
            "name": "Untitled project",
            "video": { "width": 1080, "height": 1920, "rateNum": 30, "rateDen": 1 },
        });
        assert!(is_settings_only(&fresh));
        // Any edit state present means the document must load or fail loudly.
        assert!(!is_settings_only(&serde_json::json!({ "tracks": [] })));
        assert!(!is_settings_only(
            &serde_json::json!({ "timelines": "garbage" })
        ));
        assert!(!is_settings_only(&serde_json::json!("nonsense")));
    }

    #[test]
    fn paths_compare_case_insensitively() {
        assert!(same_path("D:\\Work\\Film", "d:\\work\\film"));
        assert!(!same_path("D:\\Work\\Film", "D:\\Work\\Other"));
        assert!(same_path("/work/film/", "/work/film"));
    }

    #[cfg(windows)]
    #[test]
    fn either_slash_names_the_same_folder_on_windows() {
        assert!(same_path(
            "C:\\Temp\\.tmp1\\Round trip",
            "C:\\Temp\\.tmp1/Round trip"
        ));
        assert!(same_path("C:/Work/Film/", "c:\\work\\film"));
    }
}
