// SPDX-License-Identifier: AGPL-3.0-or-later

//! Bounded UTF-8 reads and atomic writes for subtitle files. Std-only so
//! file behavior can be tested without media/GPU services.

use std::fs::{File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// Reads at most `limit` bytes and rejects oversized or non-UTF-8 files.
pub fn read_utf8(path: &Path, limit: usize) -> io::Result<String> {
    let mut bytes = Vec::new();
    File::open(path)?
        .take(limit.saturating_add(1) as u64)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Subtitle file exceeds {limit} bytes"),
        ));
    }
    String::from_utf8(bytes).map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

struct PendingFile {
    path: PathBuf,
    committed: bool,
}
impl Drop for PendingFile {
    fn drop(&mut self) {
        if !self.committed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

/// Syncs and closes a temporary file before renaming it into place. On
/// failure the old destination is intact and the temporary is removed.
/// The caller controls where to save and whether to overwrite a file.
pub fn write_atomic(path: &Path, text: &str) -> io::Result<()> {
    static SEQUENCE: AtomicU64 = AtomicU64::new(0);
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let (mut pending, mut file) = loop {
        let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let temporary = parent.join(format!(".subtitle-{}-{sequence}.tmp", std::process::id()));
        if temporary.file_name() == path.file_name() {
            continue;
        }
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => {
                break (
                    PendingFile {
                        path: temporary,
                        committed: false,
                    },
                    file,
                );
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    };
    let permissions = match std::fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => file.set_permissions(metadata.permissions()),
        _ => Ok(()),
    };
    let written = permissions
        .and_then(|()| file.write_all(text.as_bytes()))
        .and_then(|()| file.sync_all());
    drop(file);
    written?;
    std::fs::rename(&pending.path, path)?;
    pending.committed = true;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static SEQUENCE: AtomicU64 = AtomicU64::new(0);
            let directory = std::env::temp_dir().join(format!(
                "concat-subtitle-files-{}-{}",
                std::process::id(),
                SEQUENCE.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir(&directory).unwrap();
            Self(directory)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn bounded_reader_checks_bytes_and_utf8() {
        let fixture = Fixture::new();
        let path = fixture.0.join("caption.srt");
        std::fs::write(&path, "سلام").unwrap();
        assert_eq!(read_utf8(&path, 8).unwrap(), "سلام");
        assert_eq!(
            read_utf8(&path, 7).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        std::fs::write(&path, [0xff, 0xfe]).unwrap();
        assert_eq!(
            read_utf8(&path, 8).unwrap_err().kind(),
            io::ErrorKind::InvalidData
        );
        assert!(read_utf8(&fixture.0.join("missing.srt"), 8).is_err());
    }

    #[test]
    fn atomic_writer_replaces_existing_file_and_leaves_no_temporary_file() {
        let fixture = Fixture::new();
        let path = fixture.0.join("caption.srt");
        std::fs::write(&path, "Original").unwrap();
        write_atomic(&path, "سلام\nNew caption").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "سلام\nNew caption");
        assert_eq!(std::fs::read_dir(&fixture.0).unwrap().count(), 1);
    }

    #[test]
    fn failed_rename_keeps_destination_and_cleans_temporary_file() {
        let fixture = Fixture::new();
        let destination = fixture.0.join("existing-directory");
        std::fs::create_dir(&destination).unwrap();
        std::fs::write(destination.join("original.txt"), "Keep me").unwrap();
        assert!(write_atomic(&destination, "Replacement").is_err());
        assert_eq!(
            std::fs::read_to_string(destination.join("original.txt")).unwrap(),
            "Keep me"
        );
        assert_eq!(std::fs::read_dir(&fixture.0).unwrap().count(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn replacing_a_file_preserves_its_permissions() {
        use std::os::unix::fs::PermissionsExt;
        let fixture = Fixture::new();
        let path = fixture.0.join("private.srt");
        std::fs::write(&path, "Old").unwrap();
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        write_atomic(&path, "New").unwrap();
        assert_eq!(
            std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
    }
}
