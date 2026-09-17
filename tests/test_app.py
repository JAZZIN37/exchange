import os
import sys
import unittest
import json
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

    def test_board_registration_targets_international_exchange_board(self):
        page = (Path(__file__).resolve().parents[1] / "static" / "index.html").read_text(encoding="utf-8")
        self.assertIn(
            "https://anseong-e.goean.kr/anseong-e/na/ntt/insertNttPage.do?mi=6436&bbsId=3783",
            page,
        )

    def test_worker_deploy_uploads_publisher_secrets_with_wrangler(self):
        workflow = (Path(__file__).resolve().parents[1] / ".github" / "workflows" / "deploy-cloudflare-worker.yml").read_text(encoding="utf-8")
        self.assertIn("wrangler secret bulk .worker-secrets.json", workflow)
        self.assertIn("npm install --global wrangler@4", workflow)

    def test_worker_deploy_keeps_public_post_test_manual_only(self):
        workflow = (Path(__file__).resolve().parents[1] / ".github" / "workflows" / "deploy-cloudflare-worker.yml").read_text(encoding="utf-8")
        self.assertIn("publish_test:", workflow)
        self.assertIn("inputs.publish_test == true", workflow)

    def test_board_autofill_extension_runs_on_github_pages(self):
        manifest_path = Path(__file__).resolve().parents[1] / "board-autofill-extension" / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        github_pages = "https://jazzin37.github.io/*"
        self.assertIn(github_pages, manifest["host_permissions"])
        self.assertIn(github_pages, manifest["content_scripts"][0]["matches"])

    def test_page_has_confirmed_access_code_publish_flow(self):
        page = (Path(__file__).resolve().parents[1] / "static" / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="publishAccessCode"', page)
        self.assertIn('id="publishConfirmed"', page)
        self.assertIn("api('/api/publish'", page)


if __name__ == "__main__":
    unittest.main()
