"""Publication gates reject changes not covered by native validation."""
import unittest
from verify_preview_ci import NATIVE_PREFIX, QUICK_JOB, REQUIRED, WRAPPER_PATH, verify


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

    def test_documentation_does_not_invalidate_runtime_evidence(self):
        changed = ['README.md', 'CONTRIBUTING.md', 'docs/VERSIONING.md']
        result = verify(self.run, self.jobs, 'b' * 40, True, changed)
        self.assertEqual(result['infrastructure_changes'], sorted(changed))
        for path in ['src/notes.md', 'docs/model.wgsl', 'assets/version.json']:
            with self.subTest(path=path), self.assertRaises(ValueError):
                verify(self.run, self.jobs, 'b' * 40, True, [path])

    def test_inspection_only_changes_preserve_runtime_identity(self):
        changed = ['.github/workflows/veycut-inspect.yml', 'docs/beta-tests/extended-gui.json']
        # Scenario JSON is input to inspection rather than documentation:
        # it still requires validation unless explicitly accounted for.
        result = verify(self.run, self.jobs, 'b' * 40, True, changed[:1])
        self.assertEqual(result['infrastructure_changes'], changed[:1])
        with self.assertRaises(ValueError):
            verify(self.run, self.jobs, 'b' * 40, True, changed)

    def wrapper_fixture(self):
        run = dict(self.run, path=WRAPPER_PATH, status='completed', conclusion='success')
        jobs = [dict(name=NATIVE_PREFIX + name, status='completed', conclusion='success') for name in REQUIRED]
        jobs.append(dict(name=QUICK_JOB, status='completed', conclusion='success'))
        return run, jobs

    def test_successful_known_wrapper_records_native_checks_and_skipped_windows(self):
        run, jobs = self.wrapper_fixture()
        jobs.append(dict(name=NATIVE_PREFIX + 'Tests on windows-2022', status='completed', conclusion='skipped'))
        result = verify(run, jobs, 'b' * 40, True, ['scripts/verify_preview_ci.py'])
        self.assertEqual(result['native_checks_passed'], list(REQUIRED))
        self.assertEqual(result['runtime_validation_revision'], run['head_sha'])
        self.assertEqual(result['windows_validation'][0]['conclusion'], 'skipped')

    def test_wrapper_requires_completed_successful_overall_run(self):
        for status, conclusion in [('in_progress', None), ('queued', None), ('completed', 'failure'), ('completed', 'cancelled')]:
            run, jobs = self.wrapper_fixture()
            run.update(status=status, conclusion=conclusion)
            with self.subTest(status=status, conclusion=conclusion), self.assertRaises(ValueError):
                verify(run, jobs, 'b' * 40, True, [])

    def test_wrapper_rejects_missing_duplicate_failed_or_pending_jobs(self):
        run, jobs = self.wrapper_fixture()
        for index in range(len(jobs)):
            malformed = [jobs[:index] + jobs[index + 1:], jobs + [dict(jobs[index])]]
            for status, conclusion in [('completed', 'failure'), ('completed', 'skipped'), ('in_progress', None), ('queued', None)]:
                altered = [dict(job) for job in jobs]
                altered[index].update(status=status, conclusion=conclusion)
                malformed.append(altered)
            for case in malformed:
                with self.subTest(job=jobs[index]['name'], jobs=case), self.assertRaises(ValueError):
                    verify(run, case, 'b' * 40, True, [])

    def test_wrapper_rejects_unprefixed_spoofed_and_unknown_jobs(self):
        run, jobs = self.wrapper_fixture()
        for index, job in enumerate(jobs):
            for name in [job['name'].replace(NATIVE_PREFIX, '', 1), 'spoof / ' + job['name'], job['name'] + ' / extra']:
                if name == job['name']:
                    continue
                altered = [dict(job) for job in jobs]
                altered[index]['name'] = name
                with self.subTest(name=name), self.assertRaises(ValueError):
                    verify(run, altered, 'b' * 40, True, [])
        with self.assertRaises(ValueError):
            verify(run, jobs + [dict(name='native / unknown', status='completed', conclusion='success')], 'b' * 40, True, [])

    def test_unknown_workflow_paths_are_rejected(self):
        for path in ['.github/workflows/other.yml', WRAPPER_PATH + '@main', 'fork-validation.yml']:
            run, jobs = self.wrapper_fixture()
            run['path'] = path
            with self.subTest(path=path), self.assertRaises(ValueError):
                verify(run, jobs, 'b' * 40, True, [])

    def test_wrapper_cannot_bypass_source_identity_or_scenario_validation(self):
        run, jobs = self.wrapper_fixture()
        for changed in [['src/crates/concat/src/studio.rs'], ['.github/workflows/build-app.yml'], ['docs/beta-tests/extended-gui.json'], [WRAPPER_PATH]]:
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                verify(run, jobs, 'b' * 40, True, changed)
        with self.assertRaises(ValueError):
            verify(run, jobs, 'b' * 40, False, [])

    def test_wrapper_rejects_failed_pending_or_duplicate_windows_job(self):
        run, jobs = self.wrapper_fixture()
        windows = dict(name=NATIVE_PREFIX + 'Tests on windows-2022', status='completed', conclusion='success')
        for status, conclusion in [('completed', 'failure'), ('in_progress', None), ('queued', None)]:
            altered = dict(windows, status=status, conclusion=conclusion)
            with self.subTest(status=status), self.assertRaises(ValueError):
                verify(run, jobs + [altered], 'b' * 40, True, [])
        with self.assertRaises(ValueError):
            verify(run, jobs + [windows, dict(windows)], 'b' * 40, True, [])

    def test_missing_or_failed_native_checks_are_rejected(self):
        for jobs in [self.jobs[:-1], [dict(name=name, status='completed', conclusion='failure') for name in REQUIRED]]:
            with self.assertRaises(ValueError):
                verify(self.run, jobs, 'b' * 40, True, [])


if __name__ == '__main__':
    unittest.main()
