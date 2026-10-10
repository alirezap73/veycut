"""Publication gates reject changes not covered by native validation."""
import unittest
from verify_preview_ci import REQUIRED, verify


class PreviewChecks(unittest.TestCase):
    def setUp(self):
        self.run = dict(path='.github/workflows/ci.yml', repository=dict(full_name='alirezap73/veycut'), head_sha='a' * 40, id=123)
        self.jobs = [dict(name=name, status='completed', conclusion='success') for name in REQUIRED]

    def test_mac_preview_records_separate_windows_failure(self):
        self.jobs.append(dict(name='Tests on windows-2022', status='completed', conclusion='failure'))
        result = verify(self.run, self.jobs, 'b' * 40, True, ['.github/workflows/ci.yml'])
        self.assertEqual(result['installer_scope'], ['macos-arm64'])
        self.assertEqual(result['windows_validation'][0]['conclusion'], 'failure')

    def test_runtime_and_packaging_changes_are_rejected(self):
        for path in ['src/crates/concat-render/src/gpu.rs', 'src/Cargo.lock', '.github/workflows/build-app.yml']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                verify(self.run, self.jobs, 'b' * 40, True, [path])

    def test_unrelated_revision_is_rejected(self):
        with self.assertRaises(ValueError):
            verify(self.run, self.jobs, 'b' * 40, False, [])

    def test_missing_or_failed_native_checks_are_rejected(self):
        for jobs in [self.jobs[:-1], [dict(name=name, status='completed', conclusion='failure') for name in REQUIRED]]:
            with self.assertRaises(ValueError):
                verify(self.run, jobs, 'b' * 40, True, [])


if __name__ == '__main__':
    unittest.main()
