import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT_DIR = Path(__file__).resolve().parents[3]
SERVER_PATH = ROOT_DIR / "desktop" / "ai_service" / "server.py"

sys.path.insert(0, str(SERVER_PATH.parent))
import server  # noqa: E402


class AiServiceTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

    def test_service_uses_stub_runtime_when_model_is_stub(self):
        previous_data_dir = os.environ.get("RESUME_STUDIO_AI_DATA_DIR")
        self.addCleanup(self.restore_env, "RESUME_STUDIO_AI_DATA_DIR", previous_data_dir)
        os.environ["RESUME_STUDIO_AI_DATA_DIR"] = self.temp_dir.name

        with (
            mock.patch("sidecar.service.choose_provider", return_value="stub"),
            mock.patch("sidecar.service.choose_model", return_value="stub"),
        ):
            service = server.AiService()

        self.assertEqual(service.provider, "stub")
        self.assertEqual(service.model, "stub")
        self.assertIsNone(service.deep_agent)

    def test_service_uses_model_provider_for_non_stub_runtime(self):
        previous_data_dir = os.environ.get("RESUME_STUDIO_AI_DATA_DIR")
        self.addCleanup(self.restore_env, "RESUME_STUDIO_AI_DATA_DIR", previous_data_dir)
        os.environ["RESUME_STUDIO_AI_DATA_DIR"] = self.temp_dir.name

        with (
            mock.patch("sidecar.service.choose_provider", return_value="openai"),
            mock.patch("sidecar.service.choose_model", return_value="anthropic:custom"),
            mock.patch("sidecar.service.DeepAgentRuntime") as deep_agent_runtime,
        ):
            service = server.AiService()

        self.assertEqual(service.provider, "anthropic")
        self.assertEqual(service.model, "anthropic:custom")
        deep_agent_runtime.assert_called_once()

    def restore_env(self, key: str, value: str | None):
        if value is None:
            os.environ.pop(key, None)
            return
        os.environ[key] = value


if __name__ == "__main__":
    unittest.main()
