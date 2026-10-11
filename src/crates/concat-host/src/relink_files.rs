// SPDX-License-Identifier: AGPL-3.0-or-later
//! Bounded missing-media searches that refuse ambiguous filenames.

use std::collections::{HashMap, HashSet, hash_map::Entry};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

/// The result of one complete folder search.
#[derive(Clone, Debug, Default)]
pub struct SearchResult {
    /// Files with exactly one matching basename in the searched tree.
    pub unique: HashMap<OsString, PathBuf>,
    /// Whether the entire tree was read without cancellation or a limit.
    /// Partial searches cannot prove uniqueness and return no matches.
    pub complete: bool,
}

/// Searches regular files without following symlinks. Limits both directory
/// depth and entries read; cancellation is checked between filesystem calls.
/// A slow filesystem call itself cannot be interrupted.
pub fn search(root: &Path, names: &HashSet<OsString>, cancelled: &AtomicBool) -> SearchResult {
    search_bounded(root, names, cancelled, 100_000, 64)
}

fn search_bounded(
    root: &Path,
    names: &HashSet<OsString>,
    cancelled: &AtomicBool,
    max_entries: usize,
    max_depth: usize,
) -> SearchResult {
    let mut result = SearchResult::default();
    let mut ambiguous = HashSet::new();
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    let mut visited = 0usize;
    // In particular, refuse a symlink supplied as the root.
    if !std::fs::symlink_metadata(root).is_ok_and(|meta| meta.is_dir()) {
        return result;
    }
    while let Some((directory, depth)) = stack.pop() {
        if cancelled.load(Ordering::Relaxed) {
            return SearchResult::default();
        }
        let Ok(entries) = std::fs::read_dir(directory) else {
            return SearchResult::default();
        };
        for entry in entries {
            if cancelled.load(Ordering::Relaxed) || visited >= max_entries {
                return SearchResult::default();
            }
            visited += 1;
            let Ok(entry) = entry else {
                return SearchResult::default();
            };
            let Ok(kind) = entry.file_type() else {
                return SearchResult::default();
            };
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                if depth >= max_depth {
                    return SearchResult::default();
                }
                stack.push((entry.path(), depth + 1));
            } else if kind.is_file() {
                let name = entry.file_name();
                if names.contains(&name) && !ambiguous.contains(&name) {
                    match result.unique.entry(name) {
                        Entry::Occupied(held) => {
                            ambiguous.insert(held.remove_entry().0);
                        }
                        Entry::Vacant(slot) => {
                            slot.insert(entry.path());
                        }
                    }
                }
            }
        }
    }
    result.complete = !cancelled.load(Ordering::Relaxed);
    if !result.complete {
        result.unique.clear();
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    struct Folder(PathBuf);
    impl Folder {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "veycut-relink-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
    }
    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    fn names() -> HashSet<OsString> {
        [OsString::from("clip.mp4")].into_iter().collect()
    }
    #[test]
    fn finds_nested_regular_files_only() {
        let folder = Folder::new();
        let nested = folder.0.join("nested");
        std::fs::create_dir(&nested).unwrap();
        let clip = nested.join("clip.mp4");
        std::fs::write(&clip, b"video").unwrap();
        std::fs::write(nested.join("other.mp4"), b"other").unwrap();
        let result = search(&folder.0, &names(), &AtomicBool::new(false));
        assert!(result.complete);
        assert_eq!(result.unique.len(), 1);
        assert_eq!(result.unique.get(&OsString::from("clip.mp4")), Some(&clip));
    }
    #[test]
    fn duplicates_are_never_chosen() {
        let folder = Folder::new();
        for child in ["a", "b", "c"] {
            let directory = folder.0.join(child);
            std::fs::create_dir(&directory).unwrap();
            std::fs::write(directory.join("clip.mp4"), b"video").unwrap();
        }
        let result = search(&folder.0, &names(), &AtomicBool::new(false));
        assert!(result.complete);
        assert!(result.unique.is_empty());
    }
    #[test]
    fn entry_and_depth_limits_discard_partial_matches() {
        let folder = Folder::new();
        std::fs::write(folder.0.join("clip.mp4"), b"video").unwrap();
        std::fs::create_dir(folder.0.join("nested")).unwrap();
        let cancel = AtomicBool::new(false);
        for (entries, depth) in [(0, 64), (1, 64), (100, 0)] {
            let result = search_bounded(&folder.0, &names(), &cancel, entries, depth);
            assert!(!result.complete);
            assert!(result.unique.is_empty());
        }
    }
    #[test]
    fn cancelled_or_missing_roots_return_no_matches() {
        let folder = Folder::new();
        std::fs::write(folder.0.join("clip.mp4"), b"video").unwrap();
        for (root, cancel) in [(&folder.0, true), (&folder.0.join("absent"), false)] {
            let result = search(root, &names(), &AtomicBool::new(cancel));
            assert!(!result.complete);
            assert!(result.unique.is_empty());
        }
    }
    #[cfg(unix)]
    #[test]
    fn ignores_cyclic_directory_and_file_symlinks() {
        let folder = Folder::new();
        let other = Folder::new();
        std::fs::write(other.0.join("clip.mp4"), b"video").unwrap();
        std::os::unix::fs::symlink(&folder.0, folder.0.join("cycle")).unwrap();
        std::os::unix::fs::symlink(other.0.join("clip.mp4"), folder.0.join("clip.mp4")).unwrap();
        let result = search(&folder.0, &names(), &AtomicBool::new(false));
        assert!(result.complete);
        assert!(result.unique.is_empty());
        assert!(!search(&folder.0.join("cycle"), &names(), &AtomicBool::new(false)).complete);
    }
}
