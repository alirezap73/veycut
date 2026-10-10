// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer and Concat contributors

//! The missing media dialog: what a project cannot find, and one folder
//! to look for it in.

use std::collections::HashSet;
use std::path::Path;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

use concat_host::relink_files::{self, SearchResult};

use concat_project::Command;
use concat_project::model::MissingMedia;
use slint::VecModel;

use crate::i18n::{t, tf};
use crate::platform;
use crate::studio::Studio;
use crate::ui::{MissingMediaItem, RelinkData};

/// Everything that can happen to the relink dialog.
#[derive(Clone, Debug)]
pub enum RelinkMsg {
    /// A project opened with files it cannot find.
    Show(Vec<MissingMedia>),
    /// Pick a folder and look for every missing file inside it.
    RelinkAll,
    /// A background search completed for this dialog generation.
    Found {
        /// The search generation that produced these matches.
        generation: u64,
        /// The missing media snapshot taken before the search.
        items: Vec<(String, String)>,
        /// Complete, unambiguous matches only.
        result: Result<SearchResult, String>,
    },
    Dismiss,
}

/// The relink dialog's state.
#[derive(Default)]
pub struct RelinkPane {
    pub open: bool,
    pub items: Vec<MissingMedia>,
    searching: bool,
    generation: u64,
    cancelled: Option<Arc<AtomicBool>>,
}

impl RelinkPane {
    /// Applies one message. The studio is the rest of the window; while
    /// this runs the studio's copy of the pane is a blank it must not read.
    pub fn update(&mut self, msg: RelinkMsg, studio: &mut Studio) {
        match msg {
            RelinkMsg::Show(items) => {
                self.reset();
                self.open = true;
                self.items = items;
            }
            RelinkMsg::RelinkAll => self.relink_all(studio),
            RelinkMsg::Found {
                generation,
                items,
                result,
            } => {
                if self.searching && self.generation == generation {
                    self.searching = false;
                    self.cancelled = None;
                    match result {
                        Ok(result) => self.apply_matches(items, result, studio),
                        Err(error) => studio.notify(&error, true),
                    }
                }
            }
            RelinkMsg::Dismiss => self.reset(),
        }
    }

    /// Relinks missing media by searching a folder (recursively) for files
    /// whose basename matches. The user picks one folder; each missing item
    /// looks for its own filename inside it. Successful relinks go through
    /// the editor as `UpdateMediaPath`, so undo covers the whole batch.
    fn relink_all(&mut self, studio: &mut Studio) {
        if self.searching || studio.session.is_none() {
            return;
        }
        let Some(folder) = platform::pick_folder(&t("relink.selectFolderContainingMedia"), "")
        else {
            return;
        };

        // Snapshot the missing list now: as relinks land the list shrinks,
        // and we want a stable target for the toast count.
        let items: Vec<(String, String)> = self
            .items
            .iter()
            .map(|m| (m.id.clone(), m.path.clone()))
            .collect();
        let total = items.len();
        if total == 0 {
            self.open = false;
            return;
        }

        let names: HashSet<_> = items
            .iter()
            .filter_map(|(_, path)| Path::new(path).file_name().map(|name| name.to_owned()))
            .collect();
        self.generation = self.generation.wrapping_add(1);
        let generation = self.generation;
        let cancelled = Arc::new(AtomicBool::new(false));
        self.cancelled = Some(Arc::clone(&cancelled));
        self.searching = true;
        crate::host::spawn_in_project(
            move || {
                let result = relink_files::search(&folder, &names, &cancelled);
                (items, probe_matches(result, &cancelled))
            },
            move |studio, _, _, (items, result)| {
                studio.handle(crate::panes::Msg::Relink(RelinkMsg::Found {
                    generation,
                    items,
                    result,
                }));
            },
        );
    }

    /// Cancels the current search and invalidates its queued result.
    pub fn reset(&mut self) {
        if let Some(cancelled) = self.cancelled.take() {
            cancelled.store(true, Ordering::Relaxed);
        }
        self.generation = self.generation.wrapping_add(1);
        self.searching = false;
        self.open = false;
        self.items.clear();
    }

    fn apply_matches(
        &mut self,
        items: Vec<(String, String)>,
        result: SearchResult,
        studio: &mut Studio,
    ) {
        if studio.session.is_none() {
            return;
        }
        if !result.complete {
            studio.notify(&t("relink.searchIncomplete"), true);
            return;
        }
        let total = items.len();
        // Undo or other edits may have changed media paths while the worker ran.
        let missing = studio.project().missing_media();
        let mut relinked = 0usize;
        let mut commands: Vec<Command> = Vec::new();
        for (id, path) in items {
            if !missing
                .iter()
                .any(|item| item.id == id && item.path == path)
            {
                continue;
            }
            let Some(basename) = Path::new(&path).file_name() else {
                continue;
            };
            if let Some(found) = result
                .unique
                .get(basename)
                .filter(|found| std::fs::symlink_metadata(found).is_ok_and(|meta| meta.is_file()))
            {
                let Some(new_path) = found.to_str() else {
                    continue;
                };
                commands.push(Command::UpdateMediaPath {
                    media_id: id,
                    new_path: new_path.to_owned(),
                });
                relinked += 1;
            }
        }

        if !commands.is_empty()
            && let Err(error) = studio.apply_checked(Command::Batch { commands })
        {
            studio.notify(&error, true);
            return;
        }

        // Re-check what is still missing: the dialog updates to the
        // remainder (often empty, in which case it closes).
        let remaining = studio.project().missing_media();
        if remaining.is_empty() {
            self.open = false;
            self.items.clear();
        } else {
            self.items = remaining;
        }

        studio.notify(&tf("relink.relinkedCount", &[&relinked, &total]), false);
        studio.request_media_art();
        studio.request_preview();
    }

    /// The dialog as Slint shows it.
    pub fn data(&self) -> RelinkData {
        RelinkData {
            open: self.open,
            searching: self.searching,
            items: slint::ModelRc::new(VecModel::from(
                self.items
                    .iter()
                    .map(|item| MissingMediaItem {
                        id: item.id.clone().into(),
                        name: item.name.clone().into(),
                        path: item.path.clone().into(),
                    })
                    .collect::<Vec<_>>(),
            )),
        }
    }
}

/// Search matches are only candidates: probe them on the search worker before
/// changing the project. One invalid replacement rejects the entire batch.
fn probe_matches(result: SearchResult, cancelled: &AtomicBool) -> Result<SearchResult, String> {
    validate_matches(result, cancelled, |path| {
        let path = path
            .to_str()
            .ok_or_else(|| "Media path is not valid UTF-8".to_owned())?;
        let summary = concat_host::media::probe(path)?;
        if summary.video.is_none() && summary.audio.is_none() {
            return Err(format!("{path}: no supported audio or video stream"));
        }
        Ok(())
    })
}

fn validate_matches(
    result: SearchResult,
    cancelled: &AtomicBool,
    mut probe: impl FnMut(&Path) -> Result<(), String>,
) -> Result<SearchResult, String> {
    if !result.complete || cancelled.load(Ordering::Relaxed) {
        return Ok(SearchResult::default());
    }
    for path in result.unique.values() {
        if cancelled.load(Ordering::Relaxed) {
            return Ok(SearchResult::default());
        }
        let checked = probe(path);
        // Probing a slow/network volume cannot itself be interrupted. A
        // cancellation during it still must prevent every pending update.
        if cancelled.load(Ordering::Relaxed) {
            return Ok(SearchResult::default());
        }
        checked?;
    }
    Ok(result)
}

impl Drop for RelinkPane {
    fn drop(&mut self) {
        if let Some(cancelled) = self.cancelled.take() {
            cancelled.store(true, Ordering::Relaxed);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn candidates() -> SearchResult {
        SearchResult {
            complete: true,
            unique: [("clip.mp4".into(), "replacement/clip.mp4".into())]
                .into_iter()
                .collect(),
        }
    }

    #[test]
    fn probe_failure_rejects_the_entire_recovery_batch() {
        let mut result = candidates();
        result
            .unique
            .insert("other.mp4".into(), "replacement/other.mp4".into());
        let mut calls = 0;
        let checked = validate_matches(result, &AtomicBool::new(false), |_| {
            calls += 1;
            if calls == 1 {
                Ok(())
            } else {
                Err("invalid media".into())
            }
        });
        assert_eq!(calls, 2);
        assert_eq!(checked.unwrap_err(), "invalid media");
    }

    #[test]
    fn cancellation_before_or_during_probe_discards_every_match() {
        let cancelled = AtomicBool::new(true);
        let checked = validate_matches(candidates(), &cancelled, |_| {
            panic!("cancelled search must not start probing")
        })
        .unwrap();
        assert!(!checked.complete && checked.unique.is_empty());
        cancelled.store(false, Ordering::Relaxed);
        let checked = validate_matches(candidates(), &cancelled, |_| {
            cancelled.store(true, Ordering::Relaxed);
            Ok(())
        })
        .unwrap();
        assert!(!checked.complete && checked.unique.is_empty());
    }

    #[test]
    fn empty_and_malformed_replacements_are_not_recovered() {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        struct Folder(std::path::PathBuf);
        impl Drop for Folder {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let folder = Folder(std::env::temp_dir().join(format!(
            "veycut-relink-probe-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        )));
        std::fs::create_dir(&folder.0).unwrap();
        let path = folder.0.join("clip.mp4");
        let names = ["clip.mp4".into()].into_iter().collect();
        for bytes in [b"".as_slice(), b"this is not a media container".as_slice()] {
            std::fs::write(&path, bytes).unwrap();
            let cancelled = AtomicBool::new(false);
            let result = relink_files::search(&folder.0, &names, &cancelled);
            assert!(result.complete && result.unique.len() == 1);
            assert!(probe_matches(result, &cancelled).is_err());
        }
    }

    #[test]
    fn dismiss_cancels_and_invalidates_pending_search() {
        let cancelled = Arc::new(AtomicBool::new(false));
        let mut pane = RelinkPane {
            open: true,
            searching: true,
            generation: 7,
            cancelled: Some(Arc::clone(&cancelled)),
            items: Vec::new(),
        };
        pane.reset();
        assert!(cancelled.load(Ordering::Relaxed));
        assert!(!pane.open && !pane.searching);
        assert_eq!(pane.generation, 8);
        assert!(pane.cancelled.is_none());
    }
    #[test]
    fn dropping_dialog_cancels_worker() {
        let cancelled = Arc::new(AtomicBool::new(false));
        let pane = RelinkPane {
            open: false,
            searching: false,
            generation: 0,
            items: Vec::new(),
            cancelled: Some(Arc::clone(&cancelled)),
        };
        drop(pane);
        assert!(cancelled.load(Ordering::Relaxed));
    }
}
