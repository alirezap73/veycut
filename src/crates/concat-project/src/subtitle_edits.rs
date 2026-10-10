// SPDX-License-Identifier: AGPL-3.0-or-later

//! Reversible text-track edits. Build and validate a complete batch before
//! changing the project, keeping video/audio clips and custom fonts intact.

use crate::Command;
use crate::commands::{ClipMove, ClipPatch};
use crate::model::{Clip, Timeline};
use crate::subtitles::{CaptionAppearance, Cue, caption_style, offset_cues};

fn targets<'a>(timeline: &'a Timeline, ids: Option<&[String]>) -> Vec<&'a Clip> {
    timeline
        .clips
        .iter()
        .map(|clip| clip.as_ref())
        .filter(|clip| clip.text.is_some() && ids.is_none_or(|ids| ids.contains(&clip.id)))
        .collect()
}

/// Number of scoped text clips, without cloning their subtitle content.
pub fn count(timeline: &Timeline, ids: Option<&[String]>) -> usize {
    timeline
        .clips
        .iter()
        .filter(|clip| clip.text.is_some() && ids.is_none_or(|ids| ids.contains(&clip.id)))
        .count()
}

/// Text clips for export. `None` means every text clip; an empty selection
/// means no clips. Selected media clips are never treated as captions.
pub fn selected_cues(timeline: &Timeline, ids: Option<&[String]>) -> Vec<Cue> {
    targets(timeline, ids)
        .into_iter()
        .map(|clip| Cue {
            start: clip.start,
            duration: clip.duration,
            text: clip.text.as_ref().expect("a text clip").content.clone(),
        })
        .collect()
}

/// Moves text clips by signed seconds, preserving duration, track and
/// content. Negative/overflowing results reject the entire edit. Returns
/// the single command and the number of clips it changes.
pub fn shift(
    timeline: &Timeline,
    ids: Option<&[String]>,
    seconds: f64,
) -> Result<(Command, usize), String> {
    let clips = targets(timeline, ids);
    if clips.is_empty() {
        return Err("No text clips in this scope".into());
    }
    let mut cues = selected_cues(timeline, ids);
    offset_cues(&mut cues, seconds)?;
    if seconds == 0.0 {
        return Err("Timing offset is zero".into());
    }
    let count = clips.len();
    let moves: Vec<ClipMove> = clips
        .into_iter()
        .zip(cues)
        .map(|(clip, cue)| ClipMove {
            clip_id: clip.id.clone(),
            start: cue.start,
            track_id: clip.track_id.clone(),
        })
        .collect();
    let resolved = timeline
        .resolve_moves(&moves)
        .ok_or("Timing shift would overlap clips on the same track")?;
    if resolved != moves {
        return Err("Timing shift collides with another clip; select the whole group or choose another offset".into());
    }
    Ok((Command::MoveClips { moves }, count))
}

/// Applies a caption look and vertical placement as one undo step. Each
/// text clip retains its own font and content, including imported fonts.
pub fn restyle(
    timeline: &Timeline,
    ids: Option<&[String]>,
    font_size: f64,
    offset_y: f64,
    appearance: CaptionAppearance,
) -> Result<(Command, usize), String> {
    if !font_size.is_finite()
        || !(0.001..=1.0).contains(&font_size)
        || !offset_y.is_finite()
        || !(-0.5..=0.5).contains(&offset_y)
    {
        return Err("Invalid caption size or placement".into());
    }
    let clips = targets(timeline, ids);
    if clips.is_empty() {
        return Err("No text clips in this scope".into());
    }
    let count = clips.len();
    let mut commands = Vec::new();
    for clip in clips {
        let old = clip.text.as_ref().expect("a text clip");
        commands.push(Command::UpdateClip {
            clip_id: clip.id.clone(),
            patch: ClipPatch {
                text: Some(Some(caption_style(
                    old.content.clone(),
                    font_size,
                    Some(old),
                    appearance,
                ))),
                ..ClipPatch::default()
            },
        });
        commands.push(Command::SetClipTransform {
            clip_id: clip.id.clone(),
            scale: None,
            offset_x: None,
            offset_y: Some(offset_y),
            rotation: None,
            stretch_x: None,
            stretch_y: None,
        });
    }
    Ok((Command::Batch { commands }, count))
}

/// Case-sensitive, literal UTF-8 find/replace over scoped text clips.
/// Empty captions, blank separator lines and oversized results reject the
/// whole operation; timing, positioning and style are retained.
pub fn replace(
    timeline: &Timeline,
    ids: Option<&[String]>,
    find: &str,
    replacement: &str,
) -> Result<(Command, usize), String> {
    if find.is_empty() {
        return Err("Find text is empty".into());
    }
    let mut commands = Vec::new();
    for clip in targets(timeline, ids) {
        let old = clip.text.as_ref().expect("a text clip");
        if !old.content.contains(find) {
            continue;
        }
        let content = old.content.replace(find, replacement);
        if content == old.content {
            continue;
        }
        if content.trim().is_empty()
            || content.lines().any(|line| line.trim().is_empty())
            || content.len() > crate::subtitles::MAX_SRT_BYTES
        {
            return Err(
                "Replacement would create empty, ambiguous or oversized subtitle text".into(),
            );
        }
        let mut style = old.clone();
        style.content = content;
        commands.push(Command::UpdateClip {
            clip_id: clip.id.clone(),
            patch: ClipPatch {
                text: Some(Some(style)),
                ..ClipPatch::default()
            },
        });
    }
    let count = commands.len();
    if count == 0 {
        return Err("No matching text clips".into());
    }
    Ok((Command::Batch { commands }, count))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Editor, model::TextStyle};
    fn editor() -> Editor {
        let mut editor = Editor::new();
        for (text, start) in [("سلام جهان", 1.0), ("جهان دوم", 3.0)] {
            editor
                .apply(Command::AddTextClip {
                    track_id: None,
                    above: true,
                    start,
                    style: Some(TextStyle {
                        content: text.into(),
                        font_family: "Custom Persian".into(),
                        ..TextStyle::default()
                    }),
                    duration: Some(2.0),
                    offset_y: Some(0.1),
                })
                .unwrap();
        }
        editor
    }
    #[test]
    fn selected_shift_keeps_exact_timing_and_undo_redo() {
        let mut editor = editor();
        let before = editor.project().active().clone();
        let ids = vec![before.clips[0].id.clone()];
        assert!(shift(&before, Some(&ids), 1.25).is_err());
        let (command, count) = shift(&before, Some(&ids), -0.25).unwrap();
        assert_eq!(count, 1);
        editor.apply(command).unwrap();
        assert_eq!(editor.project().active().clips[0].start, 0.75);
        assert_eq!(editor.project().active().clips[1], before.clips[1]);
        assert!(editor.undo());
        assert_eq!(editor.project().active(), &before);
        assert!(editor.redo());
        assert_eq!(editor.project().active().clips[0].duration, 2.0);
    }
    #[test]
    fn invalid_shift_leaves_the_entire_project_unchanged() {
        let editor = editor();
        let before = editor.project().clone();
        for seconds in [-2.0, f64::NAN, f64::INFINITY, 360_000.0, 0.0] {
            assert!(shift(before.active(), None, seconds).is_err());
        }
        assert_eq!(editor.project(), &before);
        assert!(shift(before.active(), Some(&[]), 1.0).is_err());
        assert!(selected_cues(before.active(), Some(&[])).is_empty());
    }
    #[test]
    fn batch_style_retains_font_content_timing_and_undoes_as_one() {
        let mut editor = editor();
        let before = editor.project().active().clone();
        let (command, count) = restyle(&before, None, 0.05, 0.35, CaptionAppearance::Box).unwrap();
        assert_eq!(count, 2);
        editor.apply(command).unwrap();
        for (after, old) in editor.project().active().clips.iter().zip(&before.clips) {
            let style = after.text.as_ref().unwrap();
            assert_eq!(style.font_family, "Custom Persian");
            assert_eq!(style.content, old.text.as_ref().unwrap().content);
            assert_eq!((after.start, after.duration), (old.start, old.duration));
            assert_eq!(style.background, "#000000cc");
            assert_eq!(after.offset_y, 0.35);
        }
        assert!(editor.undo());
        assert_eq!(editor.project().active(), &before);
    }
    #[test]
    fn unicode_replacement_preserves_style_and_rejects_partial_changes() {
        let mut editor = editor();
        let before = editor.project().active().clone();
        let (command, count) = replace(&before, None, "جهان", "دنیا").unwrap();
        assert_eq!(count, 2);
        editor.apply(command).unwrap();
        assert_eq!(
            editor.project().active().clips[0]
                .text
                .as_ref()
                .unwrap()
                .content,
            "سلام دنیا"
        );
        assert!(editor.undo());
        assert_eq!(editor.project().active(), &before);
        for (find, replacement) in [
            ("", "new"),
            ("missing", "new"),
            ("جهان دوم", ""),
            ("جهان", "a\n\nb"),
        ] {
            assert!(replace(&before, None, find, replacement).is_err());
        }
    }
}
