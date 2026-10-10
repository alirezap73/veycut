"""Checks for the trial's bounded inputs and credential transport policy."""
import unittest
import json
import urllib.error
from unittest.mock import MagicMock, patch
from model_trial import endpoint_url, prepare, query


class ModelTrialTests(unittest.TestCase):
    def test_source_identity_and_boundaries(self):
        trial = prepare("export-files")
        self.assertEqual(len(trial["source_sha256"]), 64)
        self.assertIn("output_file.rs", trial["source_path"])
        self.assertIn("Do not invent", trial["prompt"])
        with self.assertRaises(KeyError):
            prepare("../../private")

    def test_credentials_and_insecure_remote_urls_rejected(self):
        for url in ["http://example.com/v1", "https://key@example.com/v1",
                    "https://example.com/v1?key=secret", "https://example.com/v1#secret"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                endpoint_url(url)

    def test_https_and_loopback_supported(self):
        self.assertEqual(endpoint_url("https://example.com/v1/"),
                         "https://example.com/v1/chat/completions")
        self.assertEqual(endpoint_url("http://127.0.0.1:3001/v1"),
                         "http://127.0.0.1:3001/v1/chat/completions")

    def test_timeout_and_rate_limit_are_recorded_without_credentials(self):
        for error in [TimeoutError(), urllib.error.HTTPError(
                "https://example.com/v1/chat/completions", 429, "rate limited", {}, None)]:
            with self.subTest(error=type(error).__name__), patch("model_trial.urllib.request.build_opener") as opener:
                opener.return_value.open.side_effect = error
                result = query("https://example.com/v1/chat/completions", "model", "private-key", "review")
                self.assertFalse(result["request_succeeded"])
                self.assertFalse(result["response_complete"])
                self.assertNotIn("private-key", json.dumps(result))
                if isinstance(error, urllib.error.HTTPError):
                    self.assertEqual(result["http_status"], 429)

    def test_empty_malformed_and_truncated_responses_remain_unverified(self):
        for content, reason, success, complete in [
            (None, "stop", False, False), ("", "stop", False, False),
            ("partial patch", "length", True, False), ("proposal", "stop", True, True)
        ]:
            with self.subTest(content=content, reason=reason), patch("model_trial.urllib.request.build_opener") as opener:
                reply = MagicMock()
                reply.read.return_value = json.dumps({"choices": [
                    {"message": {"content": content}, "finish_reason": reason}
                ]}).encode()
                opener.return_value.open.return_value.__enter__.return_value = reply
                result = query("https://example.com/v1/chat/completions", "model", "key", "review")
                self.assertEqual(result["request_succeeded"], success)
                self.assertEqual(result["response_complete"], complete)
        with patch("model_trial.urllib.request.build_opener") as opener:
            opener.return_value.open.return_value.__enter__.return_value.read.return_value = b'[]'
            self.assertFalse(query("https://example.com/v1/chat/completions", "model", "key", "review")["request_succeeded"])


if __name__ == "__main__":
    unittest.main()
