#!/usr/bin/env python3

import json
import os
import time
import urllib.error
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("RESUME_STUDIO_AI_PORT", "8765"))
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")


def now_ms() -> int:
    return int(time.time() * 1000)


def json_headers(handler: BaseHTTPRequestHandler, status: int = 200) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()


def sse_headers(handler: BaseHTTPRequestHandler) -> None:
    handler.send_response(200)
    handler.send_header("Content-Type", "text/event-stream")
    handler.send_header("Cache-Control", "no-cache")
    handler.send_header("Connection", "close")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    content_length = int(handler.headers.get("Content-Length", "0"))
    raw_body = handler.rfile.read(content_length) if content_length > 0 else b"{}"
    if not raw_body:
        return {}
    return json.loads(raw_body.decode("utf-8"))


def choose_provider() -> str:
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    if os.environ.get("OLLAMA_BASE_URL") or os.environ.get("OLLAMA_MODEL"):
        return "ollama"
    return "stub"


def extract_message_text(message: dict) -> str:
    parts = message.get("parts", [])
    texts = []
    for part in parts:
        if part.get("type") == "text":
            texts.append(part.get("content", ""))
    return "\n".join([text for text in texts if text])


def to_model_messages(messages: list[dict], context: dict) -> list[dict]:
    workspace_name = context.get("workspaceSummary", {}).get("workspaceName") or "Unknown workspace"
    selected_resume_id = context.get("selectedResumeId") or "none"
    available_resumes = ", ".join(context.get("availableResumeIds", [])) or "none"
    system_prompt = (
        "You are Resume Studio's local AI assistant. "
        "You help the user work with a local resume workspace and rendering flow. "
        "Keep answers concise and actionable. "
        f"Current workspace: {workspace_name}. "
        f"Selected resume: {selected_resume_id}. "
        f"Available resumes: {available_resumes}."
    )

    model_messages = [{"role": "system", "content": system_prompt}]
    for message in messages:
        role = message.get("role")
        if role not in {"user", "assistant", "system"}:
            continue
        text = extract_message_text(message)
        if text:
            model_messages.append({"role": role, "content": text})
    return model_messages


def write_sse(handler: BaseHTTPRequestHandler, payload: dict) -> None:
    handler.wfile.write(f"data: {json.dumps(payload)}\n\n".encode("utf-8"))
    handler.wfile.flush()


def emit_run_started(handler: BaseHTTPRequestHandler, run_id: str, model: str) -> None:
    write_sse(
        handler,
        {
            "type": "RUN_STARTED",
            "timestamp": now_ms(),
            "runId": run_id,
            "model": model,
        },
    )


def emit_text_start(handler: BaseHTTPRequestHandler, message_id: str, model: str) -> None:
    write_sse(
        handler,
        {
            "type": "TEXT_MESSAGE_START",
            "timestamp": now_ms(),
            "messageId": message_id,
            "role": "assistant",
            "model": model,
        },
    )


def emit_text_delta(handler: BaseHTTPRequestHandler, message_id: str, model: str, delta: str) -> None:
    write_sse(
        handler,
        {
            "type": "TEXT_MESSAGE_CONTENT",
            "timestamp": now_ms(),
            "messageId": message_id,
            "delta": delta,
            "model": model,
        },
    )


def emit_text_end(handler: BaseHTTPRequestHandler, message_id: str, model: str) -> None:
    write_sse(
        handler,
        {
            "type": "TEXT_MESSAGE_END",
            "timestamp": now_ms(),
            "messageId": message_id,
            "model": model,
        },
    )


def emit_run_finished(handler: BaseHTTPRequestHandler, run_id: str, model: str) -> None:
    write_sse(
        handler,
        {
            "type": "RUN_FINISHED",
            "timestamp": now_ms(),
            "runId": run_id,
            "finishReason": "stop",
            "model": model,
        },
    )
    handler.wfile.write(b"data: [DONE]\n\n")
    handler.wfile.flush()
    handler.close_connection = True


def emit_run_error(handler: BaseHTTPRequestHandler, run_id: str, model: str, message: str) -> None:
    write_sse(
        handler,
        {
            "type": "RUN_ERROR",
            "timestamp": now_ms(),
            "runId": run_id,
            "model": model,
            "error": {"message": message},
        },
    )
    handler.wfile.write(b"data: [DONE]\n\n")
    handler.wfile.flush()
    handler.close_connection = True


def stream_stub(handler: BaseHTTPRequestHandler, model_messages: list[dict], model: str) -> None:
    last_user_message = ""
    for message in reversed(model_messages):
        if message["role"] == "user":
            last_user_message = message["content"]
            break

    reply = (
        "Stub provider active. "
        "The Python sidecar is running and ready for a real provider. "
        "Last user prompt:\n"
        f"{last_user_message or 'No prompt received.'}"
    )

    for token in reply.split(" "):
        emit_text_delta(handler, handler.message_id, model, f"{token} ")
        time.sleep(0.02)


def stream_openai(handler: BaseHTTPRequestHandler, model_messages: list[dict], model: str) -> None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    request = urllib.request.Request(
        f"{OPENAI_BASE_URL}/chat/completions",
        data=json.dumps(
            {
                "model": model,
                "messages": model_messages,
                "stream": True,
            }
        ).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line.startswith("data: "):
                continue
            payload = line[6:]
            if payload == "[DONE]":
                break
            chunk = json.loads(payload)
            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content")
            if delta:
                emit_text_delta(handler, handler.message_id, model, delta)


def stream_ollama(handler: BaseHTTPRequestHandler, model_messages: list[dict], model: str) -> None:
    request = urllib.request.Request(
        f"{OLLAMA_BASE_URL}/api/chat",
        data=json.dumps(
            {
                "model": model,
                "messages": model_messages,
                "stream": True,
            }
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=60) as response:
        for raw_line in response:
            line = raw_line.decode("utf-8").strip()
            if not line:
                continue
            chunk = json.loads(line)
            delta = chunk.get("message", {}).get("content")
            if delta:
                emit_text_delta(handler, handler.message_id, model, delta)


class ResumeStudioHandler(BaseHTTPRequestHandler):
    server_version = "ResumeStudioAI/0.1"
    protocol_version = "HTTP/1.1"

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        if self.path != "/health":
            json_headers(self, 404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
            return

        json_headers(self)
        self.wfile.write(
            json.dumps(
                {
                    "baseUrl": f"http://{HOST}:{PORT}",
                    "provider": choose_provider(),
                    "healthy": True,
                }
            ).encode("utf-8")
        )

    def do_POST(self) -> None:
        if self.path != "/chat":
            json_headers(self, 404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
            return

        body = read_json(self)
        messages = body.get("messages", [])
        data = body.get("data", {})
        context = data.get("context", {})
        provider = data.get("provider") or choose_provider()
        model = (
            data.get("model")
            or (OPENAI_MODEL if provider == "openai" else OLLAMA_MODEL if provider == "ollama" else "local-stub")
        )

        self.message_id = str(uuid.uuid4())
        run_id = str(uuid.uuid4())
        model_messages = to_model_messages(messages, context)

        sse_headers(self)
        emit_run_started(self, run_id, model)
        emit_text_start(self, self.message_id, model)

        try:
            if provider == "openai":
                stream_openai(self, model_messages, model)
            elif provider == "ollama":
                stream_ollama(self, model_messages, model)
            else:
                stream_stub(self, model_messages, model)
            emit_text_end(self, self.message_id, model)
            emit_run_finished(self, run_id, model)
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, RuntimeError, json.JSONDecodeError) as error:
            emit_run_error(self, run_id, model, str(error))

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), ResumeStudioHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
