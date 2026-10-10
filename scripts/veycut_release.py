#!/usr/bin/env python3
"""Create a VeyCut-only package manifest and checksum file from built assets."""
import argparse
import hashlib
import json
import pathlib
import re
import urllib.parse

REPOSITORY = "alirezap73/veycut"


def metadata(directory, version, tag, revision):
    """Only actual desktop packages appear in the updater's manifest."""
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Invalid source version")
    if not re.fullmatch(r"v" + re.escape(version) + r"(?:-[A-Za-z0-9.-]+)?", tag):
        raise ValueError("Tag must match the source version")
    if not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise ValueError("A full source revision is required")
    rules = [
        ("macos", "arm64", "dmg", f"VeyCut-{version}-macos-arm64.dmg"),
        ("macos", "x86_64", "dmg", f"VeyCut-{version}-macos-x86_64.dmg"),
    ]
    binaries = {}
    sums = []
    for platform, arch, kind, filename in rules:
        path = directory / filename
        if not path.is_file():
            continue
        if path.is_symlink() or path.stat().st_size == 0:
            raise ValueError("Package must be a non-empty regular file")
        sha = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                sha.update(block)
        digest = sha.hexdigest()
        binaries.setdefault(platform, {}).setdefault(arch, {})[kind] = {
            "file": filename,
            "url": f"https://github.com/{REPOSITORY}/releases/download/{urllib.parse.quote(tag, safe='')}/{urllib.parse.quote(filename, safe='')}",
            "bytes": path.stat().st_size,
            "sha256": digest,
        }
        sums.append(f"{digest}  {filename}\n")
    if not binaries:
        raise ValueError("No verified VeyCut desktop packages found")
    return {"schema": 2, "product": "VeyCut", "version": version, "tag": tag,
            "source_revision": revision, "binaries": binaries}, "".join(sums)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundles", type=pathlib.Path, required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--tag", required=True)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()
    manifest, sums = metadata(args.bundles, args.version, args.tag, args.revision)
    content = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    (args.bundles / "manifest.json").write_bytes(content)
    sums += f"{hashlib.sha256(content).hexdigest()}  manifest.json\n"
    (args.bundles / "SHA256SUMS").write_text(sums, encoding="utf-8")


if __name__ == "__main__":
    main()
