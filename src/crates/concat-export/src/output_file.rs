// SPDX-License-Identifier: AGPL-3.0-or-later

//! Isolated render files and publication that never replaces an existing output.

use std::path::{Path, PathBuf};

pub(crate) struct OutputFiles {
    // Kept alive until publication or failure; only this job's files are removed.
    directory: tempfile::TempDir,
    output: PathBuf,
}

impl OutputFiles {
    pub(crate) fn new(output: &Path) -> Result<Self, String> {
        if output.file_name().is_none() || output.as_os_str().is_empty() {
            return Err("choose an output file".into());
        }
        match output.symlink_metadata() {
            Ok(_) => return Err("an output with this name already exists".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("could not inspect output: {error}")),
        }
        let parent = output
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("could not create export folder: {error}"))?;
        let directory = tempfile::Builder::new()
            .prefix(".veycut-export-")
            .tempdir_in(parent)
            .map_err(|error| format!("could not prepare export files: {error}"))?;
        Ok(Self {
            directory,
            output: output.to_path_buf(),
        })
    }

    pub(crate) fn video(&self) -> PathBuf {
        self.directory.path().join("video.mp4")
    }
    pub(crate) fn audio(&self) -> PathBuf {
        self.directory.path().join("audio.m4a")
    }
    pub(crate) fn complete(&self) -> PathBuf {
        self.directory.path().join("complete.mp4")
    }

    pub(crate) fn publish(&self, source: &Path) -> Result<(), String> {
        // The encoder has closed the file; the full result is published only now.
        // persist_noclobber also refuses a file/symlink created after preflight.
        let staged = tempfile::TempPath::try_from_path(source)
            .map_err(|error| format!("could not prepare finished export: {error}"))?;
        staged.persist_noclobber(&self.output).map_err(|error| {
            format!(
                "could not publish {} without replacing an existing file: {error}",
                self.output.display()
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simultaneous_exports_have_independent_files_and_cleanup() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("final.mp4");
        let first = OutputFiles::new(&target).unwrap();
        let second = OutputFiles::new(&target).unwrap();
        assert_ne!(first.video(), second.video());
        std::fs::write(first.video(), b"first").unwrap();
        std::fs::write(second.video(), b"second").unwrap();
        let first_path = first.video();
        drop(first);
        assert!(!first_path.exists());
        assert_eq!(std::fs::read(second.video()).unwrap(), b"second");
        second.publish(&second.video()).unwrap();
        drop(second);
        assert_eq!(std::fs::read(target).unwrap(), b"second");
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    }

    #[test]
    fn destination_created_during_render_is_preserved() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("final.mp4");
        let files = OutputFiles::new(&target).unwrap();
        std::fs::write(files.complete(), b"rendered").unwrap();
        std::fs::write(&target, b"keep me").unwrap();
        assert!(files.publish(&files.complete()).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"keep me");
        drop(files);
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 1);
    }

    #[test]
    fn failed_or_cancelled_render_leaves_no_destination_or_work_files() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("final.mp4");
        {
            let files = OutputFiles::new(&target).unwrap();
            std::fs::write(files.video(), b"partial").unwrap();
            std::fs::write(files.audio(), b"partial audio").unwrap();
        }
        assert!(!target.exists());
        assert_eq!(std::fs::read_dir(root.path()).unwrap().count(), 0);
    }

    #[test]
    fn existing_output_and_directory_are_rejected() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("final.mp4");
        std::fs::write(&target, b"original").unwrap();
        assert!(OutputFiles::new(&target).is_err());
        assert!(OutputFiles::new(root.path()).is_err());
        assert_eq!(std::fs::read(&target).unwrap(), b"original");
    }

    #[cfg(unix)]
    #[test]
    fn dangling_symlink_is_never_replaced() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("final.mp4");
        std::os::unix::fs::symlink(root.path().join("missing"), &target).unwrap();
        assert!(OutputFiles::new(&target).is_err());
        assert!(target.symlink_metadata().unwrap().file_type().is_symlink());
    }
}
