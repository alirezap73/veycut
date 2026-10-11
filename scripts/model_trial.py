#!/usr/bin/env python3
"""Prepare a bounded coding review; optionally query a configured chat endpoint.

Never edits source, executes model output, or starts local builds. A response is
an unverified suggestion until a reviewer and the relevant tests accept it.
"""
import argparse
import hashlib
import json
import os
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
TASKS = {
    "export-files": "src/crates/concat-export/src/output_file.rs",
    "subtitle-files": "src/crates/concat-host/src/subtitle_files.rs",
    "media-recovery": "src/crates/concat-host/src/relink_files.rs",
}


def prepare(task):
    path = TASKS[task]
    source = (ROOT / path).read_text(encoding="utf-8")
    return {
        "task": task, "source_path": path,
        "source_sha256": hashlib.sha256(source.encode()).hexdigest(),
        "prompt": (
            "Review this VeyCut Rust source for one reproducible reliability bug. "
            "Return the trigger, consequence, minimal proposed diff and a regression "
            "test that fails before the fix. If no bug is justified, say so. "
            "Do not invent surrounding APIs or claim to have executed tests. "
            "Keep versions and copyright notices unchanged.\n\n" + source
        ),
    }


def endpoint_url(base):
    parsed = urllib.parse.urlsplit(base)
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Endpoint must not contain credentials, query or fragment")
    if not parsed.hostname:
        raise ValueError("Endpoint requires a hostname")
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise ValueError("Use HTTPS, or HTTP only for a loopback router")
    return base.rstrip("/") + "/chat/completions"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Avoid forwarding the bearer token to a redirected destination."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def query(url, model, key, prompt):
    payload = json.dumps({"model": model, "messages": [
        {"role": "user", "content": prompt}
    ], "max_tokens": 2048}).encode()
    request = urllib.request.Request(url, data=payload, headers={
        "Authorization": "Bearer " + key, "Content-Type": "application/json"
    })
    started = time.monotonic()
    evidence = {"request_succeeded": False, "response_complete": False}
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=90) as reply:
            result = json.loads(reply.read(2_000_001))
        choice = result["choices"][0]
        content = choice["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("No usable text response")
        reason = choice.get("finish_reason")
        evidence.update(response=content, reported_usage=result.get("usage"),
                        reported_model=result.get("model"), finish_reason=reason,
                        response_complete=reason == "stop", request_succeeded=True)
    except urllib.error.HTTPError as error:
        evidence.update(error_type="HTTPError", http_status=error.code)
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError,
            IndexError, TypeError, AttributeError) as error:
        # No response body or request headers are printed or persisted on failure.
        evidence.update(error_type=type(error).__name__)
    evidence["elapsed_seconds"] = round(time.monotonic() - started, 3)
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("task", choices=TASKS)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    parser.add_argument("--endpoint", help="Explicit /v1 base URL; omission prepares a trial offline")
    parser.add_argument("--model")
    parser.add_argument("--key-env", default="VEYCUT_TRIAL_API_KEY")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Choose a new output path; existing trial evidence is preserved")
    record = prepare(args.task)
    if args.endpoint:
        url = endpoint_url(args.endpoint)
        key = os.environ.get(args.key_env)
        if not args.model or not key:
            parser.error("An explicit model and key environment variable are required")
        record.update(query(url, args.model, key, record["prompt"]))
        record.update(requested_model=args.model, endpoint=args.endpoint)
    record.update(review_accepted=None, tests_passed=None, verified_speedup=None)
    # Exclusive creation preserves earlier trials and their evidence.
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(record, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print("Trial recorded; reviewer acceptance and test results are still required.")


if __name__ == "__main__":
    main()
