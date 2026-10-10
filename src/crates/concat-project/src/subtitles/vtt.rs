// SPDX-License-Identifier: AGPL-3.0-or-later

//! Plain-text WebVTT interchange. Unsupported layout/style blocks are
//! rejected explicitly rather than losing their meaning during an import.
//! Syntax reference: <https://www.w3.org/TR/webvtt1/>.

use super::{Cue, MAX_SRT_BYTES, parse_srt, timestamp, to_srt};

fn stamp(value: &str) -> Option<u64> {
    if value.contains(',') {
        return None;
    }
    if value.len() == 9 {
        timestamp(&format!("00:{value}"))
    } else {
        timestamp(value)
    }
}

fn unescape(text: &str) -> String {
    // Decode once: &amp;lt; represents literal &lt;, not an opening bracket.
    let mut out = String::new();
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        let entities = [
            ("&amp;", "&"),
            ("&lt;", "<"),
            ("&gt;", ">"),
            ("&nbsp;", "\u{a0}"),
            ("&lrm;", "\u{200e}"),
            ("&rlm;", "\u{200f}"),
        ];
        if let Some((entity, decoded)) =
            entities.iter().find(|(entity, _)| rest.starts_with(entity))
        {
            out.push_str(decoded);
            rest = &rest[entity.len()..];
        } else {
            out.push('&');
            rest = &rest[1..];
        }
    }
    out.push_str(rest);
    out
}

/// Reads WebVTT with optional cue identifiers, short/full timestamps,
/// BOM/CRLF, comments, overlaps and multiline UTF-8. Cue markup remains
/// literal. CSS, regions and cue settings are rejected with a clear error.
pub fn parse_vtt(input: &str) -> Result<Vec<Cue>, String> {
    if input.len() > MAX_SRT_BYTES {
        return Err("Subtitle file exceeds 1 MiB".into());
    }
    let normalized = input
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let mut lines = normalized.lines();
    let header = lines.next().ok_or("Missing WEBVTT header")?;
    if !(header == "WEBVTT" || header.starts_with("WEBVTT ") || header.starts_with("WEBVTT\t"))
        || header.contains("-->")
    {
        return Err("Missing or invalid WEBVTT header".into());
    }
    // Header metadata ends at a blank line. A cue directly below the magic
    // line is malformed; never silently consume it as metadata.
    let mut separated = false;
    for line in lines.by_ref() {
        if line.trim().is_empty() {
            separated = true;
            break;
        }
        if line.contains("-->") {
            return Err("WEBVTT header needs a blank separator".into());
        }
    }
    if !separated {
        return Err("WebVTT contains no cues".into());
    }
    let body = lines.collect::<Vec<_>>().join("\n");
    let mut blocks = Vec::<Vec<&str>>::new();
    for line in body.lines() {
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
    for block in blocks.iter().filter(|block| !block.is_empty()) {
        let first = block[0];
        if first == "NOTE" || first.starts_with("NOTE ") || first.starts_with("NOTE\t") {
            continue;
        }
        if matches!(first, "STYLE" | "REGION") {
            return Err(
                "WebVTT STYLE and REGION blocks are not supported; use plain-text cues".into(),
            );
        }
        let index = cues.len() + 1;
        let fail = |why: &str| format!("WebVTT cue {index}: {why}");
        let timing_at = usize::from(!first.contains("-->"));
        let timing = block.get(timing_at).ok_or_else(|| fail("missing timing"))?;
        let (start, end) = timing
            .split_once("-->")
            .ok_or_else(|| fail("missing timing arrow"))?;
        let end_parts: Vec<_> = end.split_whitespace().collect();
        if end_parts.len() > 1 {
            return Err(fail(
                "layout settings are not supported; use plain-text cues",
            ));
        }
        let start = stamp(start.trim()).ok_or_else(|| fail("invalid start time"))?;
        let end = end_parts
            .first()
            .and_then(|value| stamp(value))
            .ok_or_else(|| fail("invalid end time"))?;
        if end <= start || (end - start) as f64 / 1000.0 < crate::model::ranges::MIN_CLIP_DURATION {
            return Err(fail("end must be at least 1/60 second after start"));
        }
        let text = unescape(&block[timing_at + 1..].join("\n"));
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
        return Err("WebVTT contains no cues".into());
    }
    Ok(cues)
}

/// Writes chronological plain-text WebVTT with escaped entities. The
/// same timing, text and size limits as SRT apply; styling is not exported.
pub fn to_vtt(cues: &[Cue]) -> Result<String, String> {
    let srt = to_srt(cues)?;
    let normalized = parse_srt(&srt)?;
    let mut output = String::from("WEBVTT\n\n");
    let stamp = |seconds: f64| {
        let millis = (seconds * 1000.0).round() as u64;
        format!(
            "{:02}:{:02}:{:02}.{:03}",
            millis / 3_600_000,
            millis / 60_000 % 60,
            millis / 1000 % 60,
            millis % 1000
        )
    };
    for cue in normalized {
        let text = cue
            .text
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;");
        output.push_str(&format!(
            "{} --> {}\n{text}\n\n",
            stamp(cue.start),
            stamp(cue.start + cue.duration)
        ));
        if output.len() > MAX_SRT_BYTES {
            return Err("Subtitle file exceeds 1 MiB".into());
        }
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identifiers_comments_unicode_and_short_times() {
        let cues = parse_vtt("\u{feff}WEBVTT Sample\r\n\r\nNOTE comment\r\nignored\r\n\r\nintro\r\n00:01.250 --> 00:03.750\r\nسلام &amp; جهان\r\nSecond line\r\n\r\n00:00:03.000 --> 00:00:04.000\r\nOverlap").unwrap();
        assert_eq!(cues.len(), 2);
        assert_eq!(
            cues[0],
            Cue {
                start: 1.25,
                duration: 2.5,
                text: "سلام & جهان\nSecond line".into()
            }
        );
        assert_eq!(cues[1].start, 3.0);
    }
    #[test]
    fn export_round_trips_literal_markup_entities_and_overlap() {
        let cues = vec![
            Cue {
                start: 1.25,
                duration: 2.5,
                text: "<b>سلام</b> &lt; &\nجهان".into(),
            },
            Cue {
                start: 2.0,
                duration: 1.0,
                text: "Next".into(),
            },
        ];
        let output = to_vtt(&cues).unwrap();
        assert!(output.starts_with("WEBVTT\n\n00:00:01.250"));
        assert!(output.contains("&lt;b&gt;"));
        assert_eq!(parse_vtt(&output).unwrap(), cues);
    }
    #[test]
    fn rejects_lossy_or_malformed_imports_atomically() {
        for body in [
            "STYLE\n::cue { color: red; }",
            "REGION\nid:r",
            "00:01.000 --> 00:02.000 align:right\nText",
            "00:60.000 --> 01:01.000\nText",
            "00:01,000 --> 00:02,000\nText",
            "00:02.000 --> 00:01.000\nText",
            "00:01.000 --> 00:01.001\nText",
            "00:01.000 --> 00:02.000",
        ] {
            assert!(
                parse_vtt(&format!(
                    "WEBVTT\n\n00:00.000 --> 00:01.000\nValid\n\n{body}"
                ))
                .is_err(),
                "{body}"
            );
        }
        assert!(parse_vtt("WEBVTT\n00:01.000 --> 00:02.000\nText").is_err());
        assert!(parse_vtt("WEBVTTbad\n\n00:01.000 --> 00:02.000\nText").is_err());
    }
    #[test]
    fn bounds_apply_after_entity_expansion() {
        assert!(parse_vtt(&"x".repeat(MAX_SRT_BYTES + 1)).is_err());
        assert!(
            to_vtt(&[Cue {
                start: 0.0,
                duration: 1.0,
                text: "&".repeat(MAX_SRT_BYTES / 2)
            }])
            .is_err()
        );
    }
}
