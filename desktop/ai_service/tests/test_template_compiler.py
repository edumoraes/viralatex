import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
SERVER_PATH = ROOT_DIR / "desktop" / "ai_service" / "server.py"
SAMPLE_WORKSPACE = ROOT_DIR / "examples" / "sample-workspace"

sys.path.insert(0, str(SERVER_PATH.parent))
import server  # noqa: E402


class TemplateCompilerTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.workspace_root = Path(self.temp_dir.name) / "workspace"
        shutil.copytree(SAMPLE_WORKSPACE, self.workspace_root)

    def test_workspace_routes_include_templates(self):
        routes = server.workspace_backend_routes(self.workspace_root)

        self.assertIn("/templates/", routes)
        self.assertIn("/profile/", routes)
        self.assertIn("/blocks/", routes)
        self.assertIn("/resumes/", routes)

    def test_compile_workspace_template_returns_artifacts_for_valid_template(self):
        fake_tectonic = Path(self.temp_dir.name) / "tectonic"
        fake_tectonic.write_text(
            "#!/usr/bin/env bash\n"
            "set -euo pipefail\n"
            "output_dir=''\n"
            "entrypoint=''\n"
            "while [ \"$#\" -gt 0 ]; do\n"
            "  case \"$1\" in\n"
            "    -o)\n"
            "      output_dir=\"$2\"\n"
            "      shift 2\n"
            "      ;;\n"
            "    -Z)\n"
            "      shift 2\n"
            "      ;;\n"
            "    *)\n"
            "      entrypoint=\"$1\"\n"
            "      shift\n"
            "      ;;\n"
            "  esac\n"
            "done\n"
            "mkdir -p \"$output_dir\"\n"
            "printf 'compiled %s\\n' \"$entrypoint\" > \"$output_dir/resume.pdf\"\n",
            encoding="utf-8",
        )
        fake_tectonic.chmod(0o755)

        previous_tectonic_bin = os.environ.get("TECTONIC_BIN")
        self.addCleanup(self.restore_env, "TECTONIC_BIN", previous_tectonic_bin)
        os.environ["TECTONIC_BIN"] = str(fake_tectonic)

        result = server.compile_workspace_template(self.workspace_root, "default")

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["template_id"], "default")
        self.assertTrue(Path(result["output_path"]).is_file())
        self.assertTrue(Path(result["log_path"]).is_file())
        self.assertIn(str(self.workspace_root / "renders" / "agent"), result["output_path"])

    def test_compile_workspace_template_rejects_unknown_template(self):
        result = server.compile_workspace_template(self.workspace_root, "missing-template")

        self.assertEqual(result["status"], "failed")
        self.assertIn("Unknown template id", result["error_message"])

    def test_compile_workspace_template_rejects_entrypoint_outside_template_root(self):
        result = server.compile_workspace_template(
            self.workspace_root,
            "default",
            entrypoint="../secrets.tex",
        )

        self.assertEqual(result["status"], "failed")
        self.assertIn("outside the template root", result["error_message"])

    def restore_env(self, key: str, value: str | None):
        if value is None:
            os.environ.pop(key, None)
            return
        os.environ[key] = value


if __name__ == "__main__":
    unittest.main()
