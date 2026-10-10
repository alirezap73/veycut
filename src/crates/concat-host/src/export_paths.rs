// SPDX-License-Identifier: AGPL-3.0-or-later

//! Export file names that behave consistently across desktop platforms.

use std::path::{Path, PathBuf};

/// Validates one filename, stripping a single optional `.mp4` suffix.
/// Folder separators, control characters, reserved device names and
/// platform-specific filename punctuation are rejected before rendering.
pub fn video_name(input: &str) -> Result<String, String> {
    let name = input.trim();
    let name = if name.len() >= 4
        && name
            .get(name.len() - 4..)
            .is_some_and(|suffix| suffix.eq_ignore_ascii_case(".mp4"))
    {
        &name[..name.len() - 4]
    } else {
        name
    };
    if name.is_empty()
        || name.len() > 180
        || name.ends_with(['.', ' '])
        || name
            .chars()
            .any(|ch| ch.is_control() || "/\\<>:\"|?*".contains(ch))
    {
        return Err("Choose a file name of 1–180 UTF-8 bytes without path separators or reserved punctuation".into());
    }
    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    let numbered_device = ["COM", "LPT"].iter().any(|prefix| {
        stem.strip_prefix(prefix)
            .is_some_and(|tail| tail.len() == 1 && matches!(tail.as_bytes()[0], b'1'..=b'9'))
    });
    if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL") || numbered_device {
        return Err("This file name is reserved by the operating system".into());
    }
    Ok(name.to_owned())
}

/// An output under the chosen directory. Existing files are refused
/// rather than overwritten. The caller validates before starting a job.
pub fn video_target(directory: &Path, name: &str) -> Result<PathBuf, String> {
    if directory.as_os_str().is_empty() {
        return Err("Choose an export folder".into());
    }
    let path = directory.join(format!("{}.mp4", video_name(name)?));
    if path.try_exists().map_err(|error| error.to_string())? {
        return Err("An output with this name already exists; choose another file name".into());
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn multilingual_names_and_optional_extensions_are_kept() {
        assert_eq!(video_name("  ویدئوی من.MP4 ").unwrap(), "ویدئوی من");
        assert_eq!(video_name("my edit 02").unwrap(), "my edit 02");
    }
    #[test]
    fn rejects_paths_empty_names_reserved_devices_and_control_characters() {
        for name in [
            "",
            " ",
            ".mp4",
            "..",
            "../file",
            "a/b",
            "a\\b",
            "a:b",
            "CON",
            "nul.txt",
            "lpt9",
            "com1.txt",
            "trailing.",
            "a\nline",
            "a\0b",
        ] {
            assert!(video_name(name).is_err(), "{name:?}");
        }
        assert!(video_name(&"x".repeat(181)).is_err());
    }
    #[test]
    fn arbitrary_unicode_never_panics_at_a_byte_boundary() {
        for name in ["سلام", "الف", "東京", "🙂🙂", "ééé", "ویدئو.mp4"] {
            assert!(video_name(name).is_ok(), "{name}");
        }
    }
    #[test]
    fn existing_exports_are_preserved() {
        let root = std::env::temp_dir().join(format!("veycut-export-path-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("existing.mp4");
        std::fs::write(&path, b"original").unwrap();
        assert!(video_target(&root, "existing").is_err());
        assert_eq!(std::fs::read(&path).unwrap(), b"original");
        assert_eq!(
            video_target(&root, "new.mp4").unwrap(),
            root.join("new.mp4")
        );
        assert!(video_target(Path::new(""), "new").is_err());
        std::fs::remove_dir_all(root).unwrap();
    }
}
