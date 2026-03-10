import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


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

    def test_workspace_routes_include_app_templates_and_documents(self):
        routes = server.workspace_backend_routes(self.workspace_root)

        self.assertIn("/app_templates/", routes)
        self.assertIn("/documents/", routes)
        self.assertIn("/profile/", routes)
        self.assertIn("/blocks/", routes)
        self.assertIn("/resumes/", routes)

    def test_compile_workspace_document_returns_artifacts_for_valid_document(self):
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

        result = server.compile_workspace_document(self.workspace_root, "base.tex")

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["document_path"], "base.tex")
        self.assertTrue(Path(result["output_path"]).is_file())
        self.assertTrue(Path(result["log_path"]).is_file())
        self.assertIn(str(self.workspace_root / "renders" / "agent"), result["output_path"])

    def test_compile_workspace_document_rejects_unknown_document(self):
        result = server.compile_workspace_document(self.workspace_root, "missing.tex")

        self.assertEqual(result["status"], "failed")
        self.assertIn("Document entrypoint does not exist", result["error_message"])

    def test_compile_workspace_document_rejects_path_outside_documents_root(self):
        result = server.compile_workspace_document(
            self.workspace_root,
            "../secrets.tex",
        )

        self.assertEqual(result["status"], "failed")
        self.assertIn("outside the documents root", result["error_message"])

    def test_compile_latex_document_tool_schema_excludes_runtime(self):
        tool = server.compile_latex_document
        if tool is None:
            self.skipTest("LangChain tool runtime is unavailable in this Python environment.")
        schema = tool.args_schema.model_json_schema()
        self.assertEqual(set(schema["properties"]), {"document_path", "job_name"})
        self.assertNotIn("runtime", schema["properties"])

    def test_workspace_root_from_runtime_supports_object_context(self):
        runtime = SimpleNamespace(context=SimpleNamespace(workspaceRoot=str(self.workspace_root)))

        value = server.workspace_root_from_runtime(runtime)

        self.assertEqual(value, str(self.workspace_root))

    def test_workspace_root_from_runtime_supports_config_fallback(self):
        runtime = SimpleNamespace(context=None, config={"context": {"workspaceRoot": str(self.workspace_root)}})

        value = server.workspace_root_from_runtime(runtime)

        self.assertEqual(value, str(self.workspace_root))

    def test_compile_workspace_document_accepts_documents_prefixed_path(self):
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
            "printf 'compiled %s\\n' \"$entrypoint\" > \"$output_dir/base.pdf\"\n",
            encoding="utf-8",
        )
        fake_tectonic.chmod(0o755)

        previous_tectonic_bin = os.environ.get("TECTONIC_BIN")
        self.addCleanup(self.restore_env, "TECTONIC_BIN", previous_tectonic_bin)
        os.environ["TECTONIC_BIN"] = str(fake_tectonic)

        result = server.compile_workspace_document(self.workspace_root, "/documents/base.tex")

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["document_path"], "base.tex")

    def restore_env(self, key: str, value: str | None):
        if value is None:
            os.environ.pop(key, None)
            return
        os.environ[key] = value


if __name__ == "__main__":
    unittest.main()
