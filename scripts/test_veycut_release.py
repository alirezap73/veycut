"""Checksums, updater schema and rejection of wrong release identities."""
import hashlib
import pathlib
import tempfile
import unittest
from veycut_release import metadata


class ManifestTests(unittest.TestCase):
    def test_digest_size_source_and_destination_are_exact(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            package = root / "VeyCut-0.2.0-macos-arm64.dmg"
            package.write_bytes(b"package fixture")
            manifest, sums = metadata(root, "0.2.0", "v0.2.0-preview.1", "a" * 40)
            entry = manifest["binaries"]["macos"]["arm64"]["dmg"]
            self.assertEqual(entry["sha256"], hashlib.sha256(package.read_bytes()).hexdigest())
            self.assertEqual(entry["bytes"], len(b"package fixture"))
            self.assertIn("/alirezap73/veycut/releases/download/v0.2.0-preview.1/", entry["url"])
            self.assertIn(entry["sha256"], sums)
            self.assertEqual(manifest["source_revision"], "a" * 40)
            self.assertNotIn("x86_64", manifest["binaries"]["macos"])

    def test_empty_wrong_version_and_wrong_tag_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            for version, tag, revision in [("0.2.0", "v0.2.0-preview.1", "a"*40), ("0.2.0", "v0.1.0", "a"*40), ("../bad", "bad", "a"*40), ("0.2.0", "v0.2.0", "short")]:
                with self.assertRaises(ValueError):
                    metadata(root, version, tag, revision)

    def test_symlinks_and_empty_packages_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            package = root / "VeyCut-0.2.0-macos-arm64.dmg"
            package.touch()
            with self.assertRaises(ValueError): metadata(root, "0.2.0", "v0.2.0", "a"*40)
            package.unlink()
            other = root / "other"; other.write_bytes(b"test")
            package.symlink_to(other)
            with self.assertRaises(ValueError): metadata(root, "0.2.0", "v0.2.0", "a"*40)


if __name__ == "__main__":
    unittest.main()
