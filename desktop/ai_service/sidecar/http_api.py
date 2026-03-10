from __future__ import annotations

import json
import uuid
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib.parse import unquote

from .serialization import serialize


def json_headers(handler: BaseHTTPRequestHandler, status: int = 200) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.end_headers()


def sse_headers(handler: BaseHTTPRequestHandler) -> None:
    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream")
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("Connection", "close")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.end_headers()


def read_json(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    content_length = int(handler.headers.get("Content-Length", "0"))
    raw_body = handler.rfile.read(content_length) if content_length > 0 else b"{}"
    if not raw_body:
        return {}
    return json.loads(raw_body.decode("utf-8"))


def write_sse(handler: BaseHTTPRequestHandler, event: str, payload: Any) -> None:
    body = json.dumps(payload, ensure_ascii=False)
    handler.wfile.write(f"event: {event}\n".encode("utf-8"))
    handler.wfile.write(f"data: {body}\n\n".encode("utf-8"))
    handler.wfile.flush()


class ResumeStudioHandler(BaseHTTPRequestHandler):
    server_version = "ResumeStudioAI/0.2"
    protocol_version = "HTTP/1.1"

    @property
    def service(self):
        return self.server.service  # type: ignore[attr-defined]

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path == "/health":
            json_headers(self)
            self.wfile.write(json.dumps(self.service.health()).encode("utf-8"))
            return

        if self.path.startswith("/threads/") and self.path.endswith("/state"):
            thread_id = unquote(self.path[len("/threads/") : -len("/state")]).strip("/")
            json_headers(self)
            self.wfile.write(json.dumps(self.service.get_state(thread_id)).encode("utf-8"))
            return

        json_headers(self, 404)
        self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))

    def do_POST(self) -> None:
        if self.path != "/stream":
            json_headers(self, 404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
            return

        try:
            body = read_json(self)
            config = body.get("config", {})
            configurable = config.get("configurable", {})
            thread_id = configurable.get("thread_id") or str(uuid.uuid4())
            context = serialize(body.get("context", {}) or {})
            events = self.service.stream(thread_id, body.get("input"), body.get("command"), context)

            sse_headers(self)
            for event_name, payload in events:
                write_sse(self, event_name, payload)
        except Exception as error:  # noqa: BLE001
            sse_headers(self)
            write_sse(self, "error", {"message": str(error)})

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return
