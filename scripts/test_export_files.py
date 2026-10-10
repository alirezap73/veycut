#!/usr/bin/env python3
"""Test export filesystem behavior without compiling media or GUI dependencies."""
import argparse
import json
import pathlib
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    source = pathlib.Path(__file__).resolve().parents[1] / "src/crates/concat-export/src/output_file.rs"
    with tempfile.TemporaryDirectory(prefix="veycut-export-checks-") as temporary:
        directory = pathlib.Path(temporary)
        (directory / "Cargo.toml").write_text(
            '[package]\nname = "veycut-export-file-checks"\nversion = "0.0.0"\nedition = "2024"\n'
            '[workspace]\n[dependencies]\ntempfile = "=3.27.0"\n', encoding="utf-8")
        (directory / "src").mkdir()
        (directory / "src/lib.rs").write_text(
            '#[allow(dead_code)]\n#[path = ' + json.dumps(str(source), ensure_ascii=False) + ']\nmod output_file;\n',
            encoding="utf-8")
        command = ["cargo", "test", "--manifest-path", str(directory / "Cargo.toml"), "-j", "1"]
        if args.offline:
            command.append("--offline")
        subprocess.run(command + ["--", "--test-threads=1"], check=True)


if __name__ == "__main__":
    main()
