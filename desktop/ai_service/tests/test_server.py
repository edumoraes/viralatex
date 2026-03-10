import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
SERVER_PATH = ROOT_DIR / "desktop" / "ai_service" / "server.py"
PYTHON_PATH = ROOT_DIR / "desktop" / "ai_service" / ".venv" / "bin" / "python"
HOST = "127.0.0.1"
SAMPLE_WORKSPACE = ROOT_DIR / "examples" / "sample-workspace"

sys.path.insert(0, str(SERVER_PATH.parent))
import server  # noqa: E402


def reserve_port() -> int:
    import socket

    with socket.socket() as sock:
        sock.bind((HOST, 0))
        return sock.getsockname()[1]


def parse_sse(payload: str) -> list[dict]:
    events: list[dict] = []
    raw_event = {"event": "message", "data": []}

    for line in payload.splitlines():
        if not line:
            if raw_event["data"]:
                events.append(
                    {
                        "event": raw_event["event"],
                        "data": json.loads("\n".join(raw_event["data"])),
                    }
                )
            raw_event = {"event": "message", "data": []}
            continue

        if line.startswith("event: "):
            raw_event["event"] = line[7:]
        elif line.startswith("data: "):
            raw_event["data"].append(line[6:])

    if raw_event["data"]:
        events.append(
            {
                "event": raw_event["event"],
                "data": json.loads("\n".join(raw_event["data"])),
            }
        )

    return events


@unittest.skipIf(os.environ.get("SKIP_SOCKET_TESTS") == "1", "Socket tests disabled")
class AiSidecarServerProcessTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.workspace_root = Path(self.temp_dir.name) / "workspace"
        shutil.copytree(SAMPLE_WORKSPACE, self.workspace_root)
        self.data_dir = Path(self.temp_dir.name) / "ai-data"
        self.data_dir.mkdir()

    def start_server(self, **extra_env):
        port = int(extra_env.get("RESUME_STUDIO_AI_PORT", reserve_port()))
        env = {
            **os.environ,
            "RESUME_STUDIO_AI_PORT": str(port),
            "RESUME_STUDIO_AI_DATA_DIR": str(self.data_dir),
            "RESUME_STUDIO_AI_MODEL": "stub",
            **extra_env,
        }
        process = subprocess.Popen(
            [str(PYTHON_PATH), str(SERVER_PATH)],
            cwd=ROOT_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self.stop_server, process)
        self.wait_for_health(port)
        return port, process

    def stop_server(self, process):
        if process.poll() is None:
            process.kill()
            process.wait()

    def wait_for_health(self, port: int):
        deadline = time.time() + 10
        health_url = f"http://{HOST}:{port}/health"
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(health_url, timeout=1) as response:
                    if response.status == 200:
                        return
            except Exception:
                time.sleep(0.05)
        self.fail("AI sidecar did not become healthy in time.")

    def post_stream(self, port: int, body: dict) -> list[dict]:
        request = urllib.request.Request(
            f"http://{HOST}:{port}/stream",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = response.read().decode("utf-8")
            self.assertEqual(response.status, 200)
            return parse_sse(payload)

    def get_thread_state(self, port: int, thread_id: str) -> dict:
        with urllib.request.urlopen(
            f"http://{HOST}:{port}/threads/{thread_id}/state",
            timeout=5,
        ) as response:
            self.assertEqual(response.status, 200)
            return json.loads(response.read().decode("utf-8"))

    def test_thread_state_survives_sidecar_restart(self):
        thread_id = "thread-persisted"
        port, process = self.start_server()

        self.post_stream(
            port,
            {
                "input": {
                    "messages": [
                        {
                            "type": "human",
                            "content": "Remember that I prefer concise resume bullets.",
                        }
                    ]
                },
                "context": {
                    "workspaceRoot": str(self.workspace_root),
                },
                "config": {"configurable": {"thread_id": thread_id}},
            },
        )

        self.stop_server(process)
        port, _ = self.start_server(RESUME_STUDIO_AI_PORT=str(port))

        state = self.get_thread_state(port, thread_id)
        messages = state["values"]["messages"]
        serialized = json.dumps(messages)
        self.assertIn("concise resume bullets", serialized)


if __name__ == "__main__":
    unittest.main()
