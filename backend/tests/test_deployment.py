"""Cloud configuration, CORS and public artifact boundaries, without external services."""
import importlib.util
import os
from pathlib import Path
from unittest.mock import patch
import unittest

from fastapi.testclient import TestClient
from backend.deployment import allowed_origins, allowed_hosts
from backend.tests.test_b1_policy import small_fixture


class DeploymentTests(unittest.TestCase):
    def test_explicit_origins_accept_exact_urls_only(self):
        with patch.dict(os.environ, {"ENERGYSHIFT_ALLOWED_ORIGINS": "https://demo.vercel.app/,https://demo.vercel.app,http://localhost:8766"}):
            self.assertEqual(allowed_origins(), ["https://demo.vercel.app", "http://localhost:8766"])
        for bad in ["*", "https://*.vercel.app", "http://demo.vercel.app", "https://demo.vercel.app/path", "https://user:pass@demo.vercel.app", "https://demo.vercel.app?x=1", "https://demo.vercel.app#x"]:
            with self.subTest(bad=bad), patch.dict(os.environ, {"ENERGYSHIFT_ALLOWED_ORIGINS": bad}):
                with self.assertRaises(ValueError):
                    allowed_origins()

    def test_render_hostname_is_added_without_wildcard(self):
        with patch.dict(os.environ, {"RENDER_EXTERNAL_HOSTNAME": "energyshift.onrender.com"}):
            self.assertIn("energyshift.onrender.com", allowed_hosts())
            self.assertNotIn("*", allowed_hosts())
        with patch.dict(os.environ, {"RENDER_EXTERNAL_HOSTNAME": "https://wrong.onrender.com"}):
            with self.assertRaises(ValueError):
                allowed_hosts()

    def cloud_app(self):
        spec = importlib.util.spec_from_file_location("backend._deployment_test_app", Path(__file__).resolve().parents[1] / "app.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.app

    def test_real_cross_origin_preflight_and_validation(self):
        with patch.dict(os.environ, {"ENERGYSHIFT_ALLOWED_ORIGINS": "https://demo.vercel.app", "RENDER_EXTERNAL_HOSTNAME": "energyshift.onrender.com", "RENDER_GIT_COMMIT": "1234567890abcdef"}):
            client = TestClient(self.cloud_app(), base_url="https://energyshift.onrender.com")
            headers = {"Origin": "https://demo.vercel.app"}
            preflight = client.options("/api/demo/validate", headers={**headers, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
            self.assertEqual(preflight.status_code, 200)
            self.assertEqual(preflight.headers["access-control-allow-origin"], headers["Origin"])
            response = client.post("/api/demo/validate", json=small_fixture(), headers=headers)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers["access-control-allow-origin"], headers["Origin"])
            self.assertNotIn("access-control-allow-credentials", response.headers)
            self.assertIn("Origin", response.headers["vary"])
            invalid = client.post("/api/demo/validate", content="{", headers={**headers, "Content-Type": "application/json"})
            self.assertEqual(invalid.status_code, 422)
            self.assertEqual(invalid.headers["access-control-allow-origin"], headers["Origin"])
            health = client.get("/api/demo/health").json()
            self.assertEqual(health["mode"], "HOSTED_SYNTHETIC_DEMO")
            self.assertEqual(health["build_sha"], "1234567890abcdef")
            for private in ["/.env", "/.env.render", "/.env.vercel", "/render.yaml", "/backend/app.py"]:
                self.assertEqual(client.get(private).status_code, 404)

    def test_cross_origin_rejects_unlisted_preview_and_spoofed_forwarded_host(self):
        with patch.dict(os.environ, {"ENERGYSHIFT_ALLOWED_ORIGINS": "https://demo.vercel.app", "RENDER_EXTERNAL_HOSTNAME": "energyshift.onrender.com"}):
            client = TestClient(self.cloud_app(), base_url="https://energyshift.onrender.com")
            foreign = {"Origin": "https://preview-demo.vercel.app", "X-Forwarded-Host": "preview-demo.vercel.app"}
            response = client.post("/api/demo/validate", json=small_fixture(), headers=foreign)
            self.assertEqual(response.status_code, 403)
            self.assertNotIn("access-control-allow-origin", response.headers)
            self.assertEqual(client.options("/api/demo/validate", headers={**foreign, "Access-Control-Request-Method":"POST"}).status_code, 400)
            self.assertEqual(client.get("/", headers={"Host":"evil.example"}).status_code, 400)

    def test_health_works_without_git_binary(self):
        with patch.dict(os.environ, {"RENDER_GIT_COMMIT":""}), patch("backend.app.subprocess.run", side_effect=FileNotFoundError):
            from backend.app import app
            self.assertEqual(TestClient(app).get("/api/demo/health").json()["build_sha"], "UNKNOWN")
