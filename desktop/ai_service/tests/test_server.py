import json
import os
import subprocess
import sys
import time
import unittest
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[3]
SERVER_PATH = ROOT_DIR / "desktop" / "ai_service" / "server.py"
HOST = "127.0.0.1"


def reserve_port() -> int:
    import socket

    with socket.socket() as sock:
        sock.bind((HOST, 0))
        return sock.getsockname()[1]


class AiSidecarServerTest(unittest.TestCase):
    def start_server(self, **extra_env):
        port = reserve_port()
        env = {
            **os.environ,
            "RESUME_STUDIO_AI_PORT": str(port),
            "OLLAMA_BASE_URL": "",
            "OLLAMA_MODEL": "",
            "OPENAI_API_KEY": "",
            **extra_env,
        }
        process = subprocess.Popen(
            [sys.executable, str(SERVER_PATH)],
            cwd=ROOT_DIR,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(self.stop_server, process)
        self.wait_for_health(port)
        return port

    def stop_server(self, process):
        if process.poll() is None:
            process.kill()
            process.wait()

    def wait_for_health(self, port: int):
        deadline = time.time() + 5
        health_url = f"http://{HOST}:{port}/health"
        while time.time() < deadline:
            try:
                with urllib.request.urlopen(health_url, timeout=1) as response:
                    if response.status == 200:
                        return
            except Exception:
                time.sleep(0.05)
        self.fail("AI sidecar did not become healthy in time.")

    def post_chat(self, port: int):
        body = json.dumps(
            {
                "messages": [{"role": "user", "parts": [{"type": "text", "content": "oi"}]}],
                "data": {"context": {}},
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            f"http://{HOST}:{port}/chat",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = response.read().decode("utf-8")
            return payload, response

    def test_chat_stream_finishes_in_stub_mode(self):
        port = self.start_server()

        payload, response = self.post_chat(port)

        self.assertEqual(response.status, 200)
        self.assertIn('"type": "RUN_FINISHED"', payload)
        self.assertIn("data: [DONE]", payload)

    def test_chat_stream_finishes_on_provider_error(self):
        port = self.start_server(
            OPENAI_API_KEY="test-key",  # pragma: allowlist secret
            OPENAI_BASE_URL="http://127.0.0.1:9",
        )

        payload, response = self.post_chat(port)

        self.assertEqual(response.status, 200)
        self.assertIn('"type": "RUN_ERROR"', payload)
        self.assertIn("data: [DONE]", payload)
