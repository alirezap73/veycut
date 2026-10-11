"""Runner-only preparation and independent verification; never launches VeyCut."""
import argparse
import array
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import zipfile

URL = "https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v.zip"
EXPECTED_ARCHIVE_BYTES = 121284117
MAX_ARCHIVE_BYTES = 130000000
MAX_SOURCE_BYTES = 150000000
CREDITS = """Big Buck Bunny — © 2008 Blender Foundation / www.bigbuckbunny.org.
Film and its original audio: Creative Commons Attribution 3.0.
Licence and credits: https://peach.blender.org/about/
Licence: https://creativecommons.org/licenses/by/3.0/
Source: """ + URL + """
Tests may trim, resize, encode and overlay original test subtitles.
No endorsement by Blender Foundation is claimed.
The full source movie and archive remain runner-temporary files, never release assets.
"""

def run(command, timeout):
    return subprocess.run(command, check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=timeout).stdout

def probe(path):
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams",
                           "-show_format", "-of", "json", str(path)], 30))

def decode_all(path, timeout):
    # Decode every video/audio frame to a null sink, no fast partial check.
    run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-threads", "2",
         "-i", str(path), "-map", "0:v:0", "-map", "0:a:0",
         "-f", "null", "-"], timeout)

def sound(path, start, duration):
    data = run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-threads", "2",
                "-ss", str(start), "-i", str(path), "-t", str(duration),
                "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "-"], 90)
    assert len(data) <= int((duration + 1) * 8000) * 4
    values = array.array("f")
    values.frombytes(data)
    assert len(values) >= int((duration - 0.2) * 8000)
    assert all(math.isfinite(value) for value in values)
    return math.sqrt(sum(value * value for value in values) / len(values))

def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()

def prepare(temp, evidence):
    archive = temp / "official-movie.zip"
    source = temp / "BigBuckBunny-full.mp4"
    # The official host rejects Python-urllib requests with HTTP 403.
    # Use the runner's actual curl client without masquerading its user agent.
    curl = ["curl", "--fail", "--silent", "--show-error", "--location",
            "--proto", "=https", "--proto-redir", "=https"]
    head = run(curl + ["--head", "--max-time", "30", URL], 40).decode("utf-8", errors="replace")
    assert len(head) <= 65536
    status_lines = [line for line in head.splitlines() if line.startswith("HTTP/")]
    assert status_lines and status_lines[-1].split()[1] == "200"
    observed = {}
    for line in head.splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            observed[key.lower()] = value.strip()
    assert int(observed["content-length"]) == EXPECTED_ARCHIVE_BYTES
    headers = {key: observed.get(key.lower()) for key in
               ("Content-Length", "Content-Type", "ETag", "Last-Modified")}
    run(curl + ["--max-time", "240", "--max-filesize", str(MAX_ARCHIVE_BYTES),
                "--output", str(archive), URL], 250)
    size = archive.stat().st_size
    assert size == EXPECTED_ARCHIVE_BYTES and size <= MAX_ARCHIVE_BYTES
    archive_digest = file_digest(archive)
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        assert len(entries) <= 32
        assert sum(entry.file_size for entry in entries) <= MAX_SOURCE_BYTES + 1000000
        movies = [entry for entry in entries if Path(entry.filename).suffix.lower() in (".m4v", ".mp4")]
        assert len(movies) == 1
        movie = movies[0]
        assert not movie.flag_bits & 1 and 0 < movie.file_size <= MAX_SOURCE_BYTES
        # Stream only one verified member to a fixed path, never extractall.
        with bundle.open(movie) as member, source.open("wb") as output:
            shutil.copyfileobj(member, output, 1024 * 1024)
        assert source.stat().st_size == movie.file_size
    info = probe(source)
    evidence.joinpath("REAL-MEDIA-SOURCE-PROBE.json").write_text(json.dumps(info, indent=2) + "\n")
    video = next(stream for stream in info["streams"] if stream["codec_type"] == "video")
    observed_video = (video["width"], video["height"], video["codec_name"])
    assert observed_video == (640, 360, "h264"), f"Official source video metadata: {observed_video!r}"
    assert any(stream["codec_type"] == "audio" for stream in info["streams"])
    duration = float(info["format"]["duration"])
    assert 570 <= duration <= 660, "Fixture must be full-length, not a trailer or short loop"
    assert "mp4" in info["format"]["format_name"].split(",")
    decode_all(source, 360)
    evidence.joinpath("REAL-MEDIA-SOURCE.json").write_text(json.dumps({
        "url": URL, "head_headers": headers, "archive_bytes": size,
        "archive_sha256_observed_on_runner": archive_digest,
        "source_sha256_observed_on_runner": file_digest(source),
        "probe": info, "full_source_decode_passed": True,
        "checksum_is_observed_not_preexisting_trusted_digest": True,
    }, indent=2) + "\n")
    archive.unlink()
    print(source)

def verify_export(temp, evidence, args):
    target = args.export.resolve()
    source = temp / "BigBuckBunny-full.mp4"
    assert target.is_file() and target.stat().st_size <= MAX_SOURCE_BYTES
    assert 30 <= args.seconds <= 60
    original = probe(source)
    source_duration = float(original["format"]["duration"])
    assert args.source_start >= 0 and args.source_start + args.seconds <= source_duration + 0.05
    info = probe(target)
    video = next(stream for stream in info["streams"] if stream["codec_type"] == "video")
    assert (video["width"], video["height"], video["codec_name"]) == (args.width, args.height, "h264")
    rate = video["avg_frame_rate"].split("/")
    assert abs(int(rate[0]) / int(rate[1]) - args.fps) < 0.0001
    assert args.seconds - 0.1 <= float(info["format"]["duration"]) <= args.seconds + 0.2
    if video.get("nb_frames", "").isdigit():
        assert abs(int(video["nb_frames"]) - round(args.seconds * args.fps)) <= 2
    assert any(stream["codec_type"] == "audio" for stream in info["streams"])
    decode_all(target, 180)
    source_rms = sound(source, args.source_start, args.seconds)
    export_rms = sound(target, 0, args.seconds)
    assert source_rms > 0.0001, "Chosen source interval cannot test audible content"
    assert 0.5 <= export_rms / source_rms <= 2, "Expected unchanged movie audio is silent or grossly different"
    for output_time in (0.4, args.seconds / 2, args.seconds - 0.6):
        label = str(output_time).replace(".", "_")
        for kind, path, position in (
            ("export", target, output_time),
            ("source", source, args.source_start + output_time),
        ):
            run(["ffmpeg", "-nostdin", "-v", "error", "-xerror", "-threads", "2",
                 "-ss", str(position), "-i", str(path), "-frames:v", "1",
                 "-vf", "scale=640:360", "-y",
                 str(evidence / f"real-media-{kind}-{label}.png")], 30)
    evidence.joinpath("REAL-MEDIA-EXPORT.json").write_text(json.dumps({
        "probe": info, "expected_seconds": args.seconds,
        "expected_source_start_seconds": args.source_start,
        "complete_output_decode_passed": True,
        "source_rms": source_rms, "export_rms": export_rms,
        "natural_movie_audio_check": "not synthetic alternating silence/tone",
        "visual_comparison_and_subtitle_review": "pending human review of paired frames",
        "gui_edit_import_save_reopen": "must be separately proven by inspector",
        "not_user_footage_or_high_resolution_or_clean_consumer_install": True,
    }, indent=2) + "\n")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("prepare", "verify-export"))
    parser.add_argument("--evidence", type=Path, default=Path("evidence"))
    parser.add_argument("--export", type=Path)
    parser.add_argument("--source-start", type=float, default=300)
    parser.add_argument("--seconds", type=float, default=30)
    parser.add_argument("--width", type=int, default=640)
    parser.add_argument("--height", type=int, default=360)
    parser.add_argument("--fps", type=float, default=30)
    args = parser.parse_args()
    assert os.environ.get("GITHUB_ACTIONS") == "true", "This helper is runner-only"
    temp = Path(os.environ["RUNNER_TEMP"]) / "veycut-real-media"
    temp.mkdir(exist_ok=True)
    args.evidence.mkdir(parents=True, exist_ok=True)
    args.evidence.joinpath("REAL-MEDIA-CREDITS.md").write_text(CREDITS)
    assert shutil.which("ffmpeg") and shutil.which("ffprobe") and shutil.which("curl")
    if args.mode == "prepare":
        prepare(temp, args.evidence)
    else:
        assert args.export is not None
        verify_export(temp, args.evidence, args)

if __name__ == "__main__":
    main()
