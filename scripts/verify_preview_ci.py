"""Verify native checks for a Mac preview with an unchanged runtime tree."""
import datetime
import json
import pathlib
import subprocess
import sys

INFRASTRUCTURE = {
    '.github/workflows/ci.yml',
    '.github/workflows/veycut-candidate.yml',
    '.github/workflows/veycut-preview.yml',
    '.github/workflows/fork-checks.yml',
    'scripts/verify_preview_ci.py',
    'scripts/test_verify_preview_ci.py',
    'FORK-RELEASE.md',
    'RELEASE-PREVIEW.md',
}
REQUIRED = ('Engine tests and lints', 'Engine on wasm32', 'Compiles on macos-15')


def verify(run, jobs, revision, ancestor, changed):
    if run['path'] != '.github/workflows/ci.yml':
        raise ValueError('Expected the native CI workflow')
    if run['repository']['full_name'] != 'alirezap73/veycut':
        raise ValueError('Expected the VeyCut repository')
    if not ancestor or set(changed) - INFRASTRUCTURE:
        raise ValueError('Runtime or packaging source differs from the validated revision')
    for name in REQUIRED:
        matches = [job for job in jobs if job['name'] == name]
        if len(matches) != 1 or matches[0]['status'] != 'completed' or matches[0]['conclusion'] != 'success':
            raise ValueError('Required native check has not passed: ' + name)
    windows = [job for job in jobs if job['name'] == 'Tests on windows-2022']
    return {
        'product': 'VeyCut', 'installer_scope': ['macos-arm64'],
        'source_revision': revision, 'runtime_validation_revision': run['head_sha'],
        'validation_run': run['id'], 'native_checks_passed': list(REQUIRED),
        'infrastructure_changes': sorted(changed),
        'windows_validation': [dict(name=job['name'], status=job['status'], conclusion=job['conclusion']) for job in windows],
        'clean_machine_installation_verified': False,
        'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }


def main():
    run = json.loads(pathlib.Path(sys.argv[1]).read_text())
    jobs = json.loads(pathlib.Path(sys.argv[2]).read_text())['jobs']
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
    ancestor = subprocess.run(['git', 'merge-base', '--is-ancestor', run['head_sha'], revision]).returncode == 0
    changed = subprocess.check_output(['git', 'diff', '--name-only', run['head_sha'], revision], text=True).splitlines()
    evidence = verify(run, jobs, revision, ancestor, changed)
    pathlib.Path(sys.argv[3]).write_text(json.dumps(evidence, indent=2) + '\n')
    print('Mac preview checks passed; runtime source matches', run['head_sha'])


if __name__ == '__main__':
    main()
