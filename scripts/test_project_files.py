#!/usr/bin/env python3
"""Check actual project save/reopen code without compiling media or GUI services."""
import argparse
import json
import pathlib
import re
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[1]
    lock = (root / "src/Cargo.lock").read_text(encoding="utf-8")
    versions = {}
    for name in ("serde", "serde_json"):
        match = re.search(r'name = "' + name + r'"\nversion = "([^"]+)"', lock)
        if not match:
            raise ValueError("Dependency missing from source lockfile: " + name)
        versions[name] = match.group(1)
    with tempfile.TemporaryDirectory(prefix="veycut-project-checks-") as temporary:
        directory = pathlib.Path(temporary)
        (directory / "Cargo.toml").write_text(
            '[package]\nname = "veycut-project-file-checks"\nversion = "0.0.0"\nedition = "2024"\n'
            '[workspace]\n[dependencies]\n'
            'serde = { version = "=' + versions["serde"] + '", features = ["derive"] }\n'
            'serde_json = "=' + versions["serde_json"] + '"\n', encoding="utf-8")
        (directory / "src").mkdir()
        source = root / "src/crates/concat-host/src/projects.rs"
        (directory / "src/lib.rs").write_text(
            '#[allow(dead_code)]\n#[path = ' + json.dumps(str(source)) + ']\nmod project_files;\n',
            encoding="utf-8")
        command = ["cargo", "test", "--manifest-path", str(directory / "Cargo.toml"), "-j", "1"]
        if args.offline:
            command.append("--offline")
        subprocess.run(command + ["--", "--test-threads=1"], check=True)


if __name__ == "__main__":
    main()
