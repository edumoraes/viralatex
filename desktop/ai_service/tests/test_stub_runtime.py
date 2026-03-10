import json
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


def message_payload(events: list[tuple[str, object]]) -> list[object]:
    return [payload for event_name, payload in events if event_name == "messages"]


class StubRuntimeTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.workspace_root = Path(self.temp_dir.name) / "workspace"
        shutil.copytree(SAMPLE_WORKSPACE, self.workspace_root)
        self.runtime = server.StubRuntime(Path(self.temp_dir.name) / "ai-data")

    def test_get_state_returns_idle_for_new_thread(self):
        state = self.runtime.get_state("missing-thread")

        self.assertEqual(state["status"], "idle")
        self.assertEqual(state["values"]["messages"], [])

    def test_stream_returns_assistant_message_and_persists_state(self):
        thread_id = "thread-stub"

        events = list(
            self.runtime.stream(
                thread_id,
                {
                    "messages": [
                        {
                            "type": "human",
                            "content": "Summarize the current workspace.",
                        }
                    ]
                },
                None,
                {"workspaceRoot": str(self.workspace_root)},
            )
        )

        event_names = [event_name for event_name, _ in events]
        self.assertIn("messages", event_names)
        self.assertIn("values", event_names)
        self.assertLess(event_names.index("messages"), event_names.index("values"))

        assistant_chunks = [payload for payload in message_payload(events) if payload[0]["type"] == "AIMessageChunk"]
        self.assertGreater(len(assistant_chunks), 1)
        self.assertEqual(len({payload[0]["id"] for payload in assistant_chunks}), 1)

        state = self.runtime.get_state(thread_id)
        messages = state["values"]["messages"]
        self.assertEqual(messages[0]["type"], "human")
        self.assertEqual(messages[-1]["type"], "ai")
        self.assertIn("template", json.dumps(messages[-1]).lower())

    def test_stream_resume_rejects_interrupted_mutations(self):
        with self.assertRaisesRegex(ValueError, "does not support interrupted mutations"):
            list(
                self.runtime.stream(
                    "thread-resume",
                    None,
                    {"resume": {"approved": True}},
                    {"workspaceRoot": str(self.workspace_root)},
                )
            )


if __name__ == "__main__":
    unittest.main()
