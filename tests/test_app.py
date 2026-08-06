import os
import sys
import unittest
from pathlib import Path

os.environ["MOCK_TRANSLATION"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app  # noqa: E402


class AppTest(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_health(self):
        response = self.client.get("/api/health")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json["ok"])
        self.assertEqual(response.json["provider"], "DeepL")
        self.assertTrue(response.json["mock_mode"])

    def test_mock_translation(self):
        response = self.client.post("/api/translate", json={"text": "안성초등학교 국제교류 활동"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["sourceLanguage"], "ko")
        self.assertEqual(response.json["provider"], "DeepL")
        self.assertIn("en", response.json["translations"])
        self.assertIn("ru", response.json["translations"])

    def test_cors_requires_explicit_origin(self):
        original = os.environ.get("ALLOWED_ORIGINS")
        try:
            os.environ["ALLOWED_ORIGINS"] = "https://example.github.io"
            denied = self.client.get("/api/health", headers={"Origin": "https://evil.example"})
            allowed = self.client.get("/api/health", headers={"Origin": "https://example.github.io"})
            self.assertNotIn("Access-Control-Allow-Origin", denied.headers)
            self.assertEqual(allowed.headers.get("Access-Control-Allow-Origin"), "https://example.github.io")
        finally:
            if original is None:
                os.environ.pop("ALLOWED_ORIGINS", None)
            else:
                os.environ["ALLOWED_ORIGINS"] = original

    def test_empty_text_rejected(self):
        response = self.client.post("/api/translate", json={"text": ""})
        self.assertEqual(response.status_code, 400)


if __name__ == "__main__":
    unittest.main()
