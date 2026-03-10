import os
import sys
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
SERVER_PATH = ROOT_DIR / "desktop" / "ai_service" / "server.py"

sys.path.insert(0, str(SERVER_PATH.parent))
import server  # noqa: E402


class AiSidecarConfigTest(unittest.TestCase):
    def test_choose_provider_prefers_explicit_openai_provider(self):
        previous_provider = os.environ.get("RESUME_STUDIO_AI_PROVIDER")
        previous_key = os.environ.get("OPENAI_API_KEY")
        self.addCleanup(self.restore_env, "RESUME_STUDIO_AI_PROVIDER", previous_provider)
        self.addCleanup(self.restore_env, "OPENAI_API_KEY", previous_key)
        os.environ["RESUME_STUDIO_AI_PROVIDER"] = "openai"
        os.environ["OPENAI_API_KEY"] = "sk-test"  # pragma: allowlist secret

        self.assertEqual(server.choose_provider(), "openai")
        self.assertEqual(server.choose_model("openai"), "openai:gpt-4o-mini")

    def test_choose_provider_prefers_explicit_anthropic_provider(self):
        previous_provider = os.environ.get("RESUME_STUDIO_AI_PROVIDER")
        previous_key = os.environ.get("ANTHROPIC_API_KEY")
        self.addCleanup(self.restore_env, "RESUME_STUDIO_AI_PROVIDER", previous_provider)
        self.addCleanup(self.restore_env, "ANTHROPIC_API_KEY", previous_key)
        os.environ["RESUME_STUDIO_AI_PROVIDER"] = "anthropic"
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-test"  # pragma: allowlist secret

        self.assertEqual(server.choose_provider(), "anthropic")
        self.assertEqual(server.choose_model("anthropic"), "anthropic:claude-3-5-haiku-latest")

    def test_choose_provider_prefers_explicit_ollama_provider(self):
        previous_provider = os.environ.get("RESUME_STUDIO_AI_PROVIDER")
        self.addCleanup(self.restore_env, "RESUME_STUDIO_AI_PROVIDER", previous_provider)
        os.environ["RESUME_STUDIO_AI_PROVIDER"] = "ollama"

        self.assertEqual(server.choose_provider(), "ollama")
        self.assertEqual(server.choose_model("ollama"), "ollama:llama3.2")

    def restore_env(self, key: str, value: str | None):
        if value is None:
            os.environ.pop(key, None)
            return
        os.environ[key] = value


if __name__ == "__main__":
    unittest.main()
