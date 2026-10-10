"""Checks for the trial's bounded inputs and credential transport policy."""
import unittest
from model_trial import endpoint_url, prepare


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


if __name__ == "__main__":
    unittest.main()
