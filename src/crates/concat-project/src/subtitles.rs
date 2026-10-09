// SPDX-License-Identifier: AGPL-3.0-or-later

//! UTF-8 SubRip cues, validated before any edit is made.

/// Import/export bound for a subtitle track (one mebibyte).
pub const MAX_SRT_BYTES: usize = 1_048_576;

/// A caption look; the font follows the user's title preference.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub enum CaptionAppearance {
    /// Keep the user's colors, stroke and background.
    #[default]
    Inherit,
    /// White text over a rounded dark background.
    Box,
    /// White text with a black outline.
    Outline,
}

/// Builds a caption inside 82% of frame width. Appearance overrides keep
/// the user's font, including an imported font.
pub fn caption_style(
    content: String,
    font_size: f64,
    base: Option<&crate::model::TextStyle>,
    appearance: CaptionAppearance,
) -> crate::model::TextStyle {
    use crate::model::{TextAlign, TextStyle};
    let mut style = base.cloned().unwrap_or_else(|| TextStyle {
        font_family: "Hanken Grotesk".to_owned(),
        font_weight: 600.0,
        ..TextStyle::default()
    });
    style.content = content;
    style.font_size = font_size;
    style.max_width = 0.82;
    style.max_height = 0.0;
    style = style.tidy();
    if appearance != CaptionAppearance::Inherit {
        style.color = "#ffffff".to_owned();
        style.opacity = 1.0;
        style.align = TextAlign::Center;
        style.italic = false;
        style.tracking = 0.0;
        style.line_height = 1.2;
        style.stroke_color = "#000000".to_owned();
    }
    match appearance {
        CaptionAppearance::Inherit => {}
        CaptionAppearance::Box => {
            style.font_weight = 700.0;
            style.stroke_width = 0.0;
            style.shadow = false;
            style.background = "#000000cc".to_owned();
            style.background_radius = style.font_size * 0.225;
            style.background_padding_x = style.font_size * 0.35;
            style.background_padding_y = style.font_size * 0.225;
        }
        CaptionAppearance::Outline => {
            style.font_weight = 800.0;
            style.background.clear();
            style.shadow = true;
            style.stroke_width = style.font_size * 0.075;
        }
    }
    style
}

/// One timed subtitle, ready to become an editable title clip.
#[derive(Clone, Debug, PartialEq)]
pub struct Cue {
    /// Seconds from timeline zero.
    pub start: f64,
    /// Positive duration in seconds.
    pub duration: f64,
    /// UTF-8 content, preserving line breaks.
    pub text: String,
}

fn timestamp(value: &str) -> Option<u64> {
    let bytes = value.as_bytes();
    if bytes.len() != 12 || bytes[2] != b':' || bytes[5] != b':' || !matches!(bytes[8], b',' | b'.')
    {
        return None;
    }
    let number = |range: std::ops::Range<usize>| -> Option<u64> {
        let part = &bytes[range];
        part.iter().all(u8::is_ascii_digit).then(|| {
            part.iter()
                .fold(0, |value, digit| value * 10 + u64::from(digit - b'0'))
        })
    };
    let hours = number(0..2)?;
    let minutes = number(3..5)?;
    let seconds = number(6..8)?;
    let millis = number(9..12)?;
    (minutes < 60 && seconds < 60)
        .then_some(((hours * 60 + minutes) * 60 + seconds) * 1000 + millis)
}

/// Keeps multiline text and overlapping cues. A malformed cue rejects the
/// whole file, so an import cannot quietly drop part of a subtitle track.
/// Inline markup remains literal text; it is not interpreted as styling.
pub fn parse_srt(input: &str) -> Result<Vec<Cue>, String> {
    if input.len() > MAX_SRT_BYTES {
        return Err("SRT file exceeds 1 MiB".to_owned());
    }
    let normalized = input
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let mut blocks: Vec<Vec<&str>> = Vec::new();
    for line in normalized.lines() {
        if line.trim().is_empty() {
            if blocks.last().is_some_and(|block| !block.is_empty()) {
                blocks.push(Vec::new());
            }
        } else {
            if blocks.is_empty() {
                blocks.push(Vec::new());
            }
            blocks.last_mut().expect("a block exists").push(line);
        }
    }
    let mut cues = Vec::new();
    for (index, block) in blocks.iter().filter(|block| !block.is_empty()).enumerate() {
        let fail = |reason: &str| format!("SRT cue {}: {reason}", index + 1);
        let first = block[0].trim();
        let time_line = usize::from(first.bytes().all(|byte| byte.is_ascii_digit()));
        let timing = block.get(time_line).ok_or_else(|| fail("missing timing"))?;
        let (start, end) = timing
            .split_once("-->")
            .ok_or_else(|| fail("expected HH:MM:SS,mmm --> HH:MM:SS,mmm"))?;
        let start = timestamp(start.trim()).ok_or_else(|| fail("invalid start time"))?;
        let end = timestamp(end.trim()).ok_or_else(|| fail("invalid end time"))?;
        if end <= start {
            return Err(fail("end must be after start"));
        }
        if (end - start) as f64 / 1000.0 < crate::model::ranges::MIN_CLIP_DURATION {
            return Err(fail(
                "duration is shorter than the editor's minimum (1/60 second)",
            ));
        }
        let text = block[time_line + 1..].join("\n");
        if text.trim().is_empty() {
            return Err(fail("missing text"));
        }
        cues.push(Cue {
            start: start as f64 / 1000.0,
            duration: (end - start) as f64 / 1000.0,
            text,
        });
    }
    if cues.is_empty() {
        return Err("SRT contains no cues".to_owned());
    }
    Ok(cues)
}

/// Moves every cue by `offset` seconds. Validates the whole track first,
/// so a negative or overflowing result leaves all original cues intact.
pub fn offset_cues(cues: &mut [Cue], offset: f64) -> Result<(), String> {
    if !offset.is_finite() {
        return Err("Subtitle offset must be finite".to_owned());
    }
    for (index, cue) in cues.iter().enumerate() {
        let start = cue.start + offset;
        let end = start + cue.duration;
        if !start.is_finite()
            || !end.is_finite()
            || !cue.duration.is_finite()
            || start < 0.0
            || cue.duration < crate::model::ranges::MIN_CLIP_DURATION
            || (end * 1000.0).round() > 359_999_999.0
        {
            return Err(format!(
                "SRT cue {}: offset produces invalid timing",
                index + 1
            ));
        }
    }
    for cue in cues {
        cue.start += offset;
    }
    Ok(())
}

/// All text clips in the active timeline, including titles, as timed cues.
/// Visibility and text styling are intentionally not part of SubRip.
pub fn timeline_cues(timeline: &crate::model::Timeline) -> Vec<Cue> {
    timeline
        .clips
        .iter()
        .filter_map(|clip| {
            clip.text.as_ref().map(|style| Cue {
                start: clip.start,
                duration: clip.duration,
                text: style.content.clone(),
            })
        })
        .collect()
}

/// Serializes cues chronologically with millisecond precision. Rejects
/// invalid or unrepresentable cues instead of writing a partial track.
pub fn to_srt(cues: &[Cue]) -> Result<String, String> {
    if cues.is_empty() {
        return Err("No text clips to export".to_owned());
    }
    let mut ordered: Vec<&Cue> = cues.iter().collect();
    ordered.sort_by(|a, b| a.start.total_cmp(&b.start));
    let stamp = |millis: u64| {
        format!(
            "{:02}:{:02}:{:02},{:03}",
            millis / 3_600_000,
            millis / 60_000 % 60,
            millis / 1000 % 60,
            millis % 1000
        )
    };
    let mut output = String::new();
    for (index, cue) in ordered.into_iter().enumerate() {
        let fail = |reason: &str| format!("SRT cue {}: {reason}", index + 1);
        let end = cue.start + cue.duration;
        if !cue.start.is_finite()
            || !cue.duration.is_finite()
            || !end.is_finite()
            || cue.start < 0.0
            || cue.duration < crate::model::ranges::MIN_CLIP_DURATION
        {
            return Err(fail("invalid timing"));
        }
        let start_ms = (cue.start * 1000.0).round();
        let end_ms = (end * 1000.0).round();
        if end_ms > 359_999_999.0 {
            return Err(fail("time exceeds 99:59:59,999"));
        }
        let text = cue.text.replace("\r\n", "\n").replace('\r', "\n");
        if text.trim().is_empty() || text.lines().any(|line| line.trim().is_empty()) {
            return Err(fail("text is empty or contains a blank separator line"));
        }
        output.push_str(&format!(
            "{}\n{} --> {}\n{}\n\n",
            index + 1,
            stamp(start_ms as u64),
            stamp(end_ms as u64),
            text.trim_end_matches('\n')
        ));
        if output.len() > MAX_SRT_BYTES {
            return Err("SRT file exceeds 1 MiB".to_owned());
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_utf8_multiline_bom_crlf_and_exact_timing() {
        let cues = parse_srt("\u{feff}1\r\n00:00:01,250 --> 00:00:03,750\r\nسلام\r\nجهان\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nHello").unwrap();
        assert_eq!(cues.len(), 2);
        assert_eq!(
            cues[0],
            Cue {
                start: 1.25,
                duration: 2.5,
                text: "سلام\nجهان".to_owned()
            }
        );
        assert_eq!(cues[1].start, 3.0); // Overlap is intentional and preserved.
    }

    #[test]
    fn accepts_optional_index_and_dot_milliseconds() {
        let cues = parse_srt("\n00:01:00.001 --> 00:01:01.501\nCaption\n").unwrap();
        assert_eq!(cues[0].start, 60.001);
        assert_eq!(cues[0].duration, 1.5);
    }

    #[test]
    fn rejects_invalid_cues_without_partial_import() {
        for invalid in [
            "",
            "1",
            "1\n00:60:00,000 --> 00:61:00,000\nText",
            "1\n00:00:02,000 --> 00:00:01,000\nText",
            "1\n00:00:01,000 --> 00:00:01,000\nText",
            "1\n00:00:01,000 --> 00:00:01,001\nText",
            "1\n00:00:01,000 --> 00:00:02,000",
            "1\n00:00:01,000 --> 00:00:02,000\nText\n\n2\ninvalid\nOther",
            "1\n۰۰:۰۰:۰۱,۰۰۰ --> 00:00:02,000\nText",
        ] {
            assert!(parse_srt(invalid).is_err(), "accepted {invalid:?}");
        }
    }

    #[test]
    fn imported_cues_keep_timing_and_undo_as_one_edit() {
        use crate::model::TextStyle;
        use crate::{Command, Editor};
        let cues = parse_srt(
            "1\n00:00:01,250 --> 00:00:03,750\nسلام\n\n2\n00:00:03,000 --> 00:00:04,000\nOverlap",
        )
        .unwrap();
        let mut editor = Editor::new();
        editor
            .apply(Command::Batch {
                commands: cues
                    .iter()
                    .map(|cue| Command::AddTextClip {
                        track_id: None,
                        above: true,
                        start: cue.start,
                        duration: Some(cue.duration),
                        offset_y: Some(0.24),
                        style: Some(TextStyle {
                            content: cue.text.clone(),
                            ..TextStyle::default()
                        }),
                    })
                    .collect(),
            })
            .unwrap();
        let clips = &editor.project().active().clips;
        assert_eq!(clips.len(), cues.len());
        for (clip, cue) in clips.iter().zip(&cues) {
            assert_eq!(clip.start, cue.start);
            assert_eq!(clip.duration, cue.duration);
            assert_eq!(clip.text.as_ref().unwrap().content, cue.text);
        }
        assert!(editor.undo());
        assert!(editor.project().active().clips.is_empty());
        assert!(!editor.undo());
        assert!(editor.redo());
        assert_eq!(editor.project().active().clips.len(), 2);
        let exported = to_srt(&timeline_cues(editor.project().active())).unwrap();
        assert_eq!(parse_srt(&exported).unwrap(), cues);
        let document = editor.to_document(&crate::DocumentSettings {
            name: "Subtitle round trip".to_owned(),
            width: 720,
            height: 1280,
            rate_num: 30,
            rate_den: 1,
        });
        let reopened = Editor::from_document(&document).unwrap();
        assert_eq!(timeline_cues(reopened.project().active()), cues);
    }

    #[test]
    fn export_sorts_preserves_overlap_and_rounds_to_milliseconds() {
        let cues = vec![
            Cue {
                start: 3.0004,
                duration: 1.0003,
                text: "Second".to_owned(),
            },
            Cue {
                start: 1.25,
                duration: 2.5,
                text: "سلام\nجهان".to_owned(),
            },
        ];
        let output = to_srt(&cues).unwrap();
        let reopened = parse_srt(&output).unwrap();
        assert_eq!(reopened[0], cues[1]);
        assert_eq!(reopened[1].start, 3.0);
        assert_eq!(reopened[1].duration, 1.001);
        assert!(output.starts_with("1\n00:00:01,250 --> 00:00:03,750\n"));
    }

    #[test]
    fn export_rejects_invalid_values_and_ambiguous_text() {
        let cue = Cue {
            start: 0.0,
            duration: 1.0,
            text: "Valid".to_owned(),
        };
        assert!(to_srt(&[]).is_err());
        for invalid in [
            Cue {
                start: f64::NAN,
                ..cue.clone()
            },
            Cue {
                duration: f64::INFINITY,
                ..cue.clone()
            },
            Cue {
                start: -1.0,
                ..cue.clone()
            },
            Cue {
                start: 360_000.0,
                ..cue.clone()
            },
            Cue {
                duration: 0.001,
                ..cue.clone()
            },
            Cue {
                text: "One\n\nTwo".to_owned(),
                ..cue.clone()
            },
            Cue {
                text: " \n".to_owned(),
                ..cue.clone()
            },
        ] {
            assert!(to_srt(&[cue.clone(), invalid]).is_err());
        }
    }

    #[test]
    fn export_handles_hour_boundary_without_invalid_minutes() {
        let cue = Cue {
            start: 3599.9996,
            duration: 2.0,
            text: "Hour".to_owned(),
        };
        let output = to_srt(&[cue]).unwrap();
        assert!(output.contains("01:00:00,000 --> 01:00:02,000"));
        assert_eq!(parse_srt(&output).unwrap()[0].start, 3600.0);
    }

    #[test]
    fn offset_preserves_durations_and_rejects_the_whole_track_on_failure() {
        let mut cues = parse_srt(
            "1\n00:00:01,000 --> 00:00:02,000\nFirst\n\n2\n00:00:00,500 --> 00:00:01,500\nSecond",
        )
        .unwrap();
        let original = cues.clone();
        assert!(offset_cues(&mut cues, -0.75).is_err());
        assert_eq!(cues, original); // The later cue fails; the first must not move.
        assert!(offset_cues(&mut cues, f64::NAN).is_err());
        assert!(offset_cues(&mut cues, 360_000.0).is_err());
        assert_eq!(cues, original);
        offset_cues(&mut cues, 10.25).unwrap();
        assert_eq!(cues[0].start, 11.25);
        assert_eq!(cues[1].start, 10.75);
        assert_eq!(cues[0].duration, original[0].duration);
        assert_eq!(cues[1].text, original[1].text);
    }

    #[test]
    fn caption_looks_preserve_custom_font_and_scale_with_text_size() {
        let base = crate::model::TextStyle {
            font_family: "My Persian Font".to_owned(),
            color: "#ff0000".to_owned(),
            background: "#112233".to_owned(),
            max_height: 0.5,
            ..crate::model::TextStyle::default()
        };
        for appearance in [
            CaptionAppearance::Inherit,
            CaptionAppearance::Box,
            CaptionAppearance::Outline,
        ] {
            let small = caption_style("سلام".to_owned(), 0.04, Some(&base), appearance);
            let large = caption_style("سلام".to_owned(), 0.08, Some(&base), appearance);
            assert_eq!(small.font_family, base.font_family);
            assert_eq!(small.content, "سلام");
            assert_eq!(small.max_width, 0.82);
            assert_eq!(small.max_height, 0.0);
            match appearance {
                CaptionAppearance::Inherit => {
                    assert_eq!(small.color, base.color);
                    assert_eq!(small.background, base.background);
                }
                CaptionAppearance::Box => {
                    assert_eq!(small.stroke_width, 0.0);
                    assert_eq!(small.background, "#000000cc");
                    assert_eq!(large.background_padding_x, small.background_padding_x * 2.0);
                }
                CaptionAppearance::Outline => {
                    assert!(small.background.is_empty());
                    assert_eq!(large.stroke_width, small.stroke_width * 2.0);
                }
            }
        }
    }

    #[test]
    fn import_and_export_enforce_the_same_size_limit() {
        let text = "x".repeat(MAX_SRT_BYTES + 1);
        assert!(parse_srt(&text).is_err());
        assert!(
            to_srt(&[Cue {
                start: 0.0,
                duration: 1.0,
                text
            }])
            .is_err()
        );
    }
}
