#!/usr/bin/env python3

from __future__ import annotations

import json
import os
import uuid
from dataclasses import asdict, is_dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote

import yaml

try:
    from deepagents import create_deep_agent
    from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend
    from langgraph.checkpoint.sqlite import SqliteSaver
    from langgraph.types import Command
except ModuleNotFoundError:
    create_deep_agent = None
    CompositeBackend = FilesystemBackend = StateBackend = SqliteSaver = Command = None

HOST = "127.0.0.1"
PORT = int(os.environ.get("RESUME_STUDIO_AI_PORT", "8765"))
DEFAULT_OPENAI_MODEL = "openai:gpt-4o-mini"
DEFAULT_ANTHROPIC_MODEL = "anthropic:claude-3-5-haiku-latest"
DEFAULT_OLLAMA_MODEL = "ollama:llama3.2"
SUPPORTED_MODELS = {
    "openai": DEFAULT_OPENAI_MODEL,
    "anthropic": DEFAULT_ANTHROPIC_MODEL,
    "ollama": DEFAULT_OLLAMA_MODEL,
    "stub": "stub",
}


def choose_provider() -> str:
    configured = os.environ.get("RESUME_STUDIO_AI_PROVIDER", "").strip().lower()
    if configured == "openai" and os.environ.get("OPENAI_API_KEY"):
        return "openai"
    if configured == "anthropic" and os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if configured == "ollama":
        return "ollama"
    if configured == "stub":
        return "stub"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "anthropic"
    if os.environ.get("OLLAMA_BASE_URL") or os.environ.get("OLLAMA_MODEL"):
        return "ollama"
    return "stub"


def choose_model(provider: str | None = None) -> str:
    configured = os.environ.get("RESUME_STUDIO_AI_MODEL")
    if configured:
        return configured
    resolved_provider = provider or choose_provider()
    return SUPPORTED_MODELS.get(resolved_provider, "stub")


def provider_from_model(model: str) -> str:
    if model == "stub":
        return "stub"
    if ":" in model:
        return model.split(":", 1)[0]
    return model


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


def append_interrupts(values: dict[str, Any], interrupts: list[dict[str, Any]]) -> dict[str, Any]:
    next_values = dict(values)
    if interrupts:
        next_values["__interrupt__"] = interrupts
    elif "__interrupt__" in next_values:
        del next_values["__interrupt__"]
    return next_values


def serialize(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(key): serialize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [serialize(item) for item in value]
    if is_dataclass(value):
        return serialize(asdict(value))
    if hasattr(value, "model_dump"):
        return serialize(value.model_dump())
    if hasattr(value, "dict"):
        return serialize(value.dict())
    if hasattr(value, "value") and hasattr(value, "id"):
        return {
            "id": serialize(getattr(value, "id")),
            "value": serialize(getattr(value, "value")),
        }
    if hasattr(value, "content") and hasattr(value, "type"):
        serialized = {
            "type": serialize(getattr(value, "type")),
            "content": serialize(getattr(value, "content")),
        }
        for field in [
            "id",
            "name",
            "tool_calls",
            "tool_call_id",
            "status",
            "additional_kwargs",
            "response_metadata",
            "usage_metadata",
        ]:
            if hasattr(value, field):
                field_value = serialize(getattr(value, field))
                if field_value not in (None, [], {}):
                    serialized[field] = field_value
        return serialized
    if hasattr(value, "__dict__"):
        return serialize(vars(value))
    return str(value)


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def write_yaml(path: Path, value: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(value, handle, sort_keys=False, allow_unicode=True)


class StubRuntime:
    def __init__(self, data_dir: Path) -> None:
        self.thread_dir = data_dir / "threads"
        self.thread_dir.mkdir(parents=True, exist_ok=True)

    def state_path(self, thread_id: str) -> Path:
        return self.thread_dir / f"{thread_id}.json"

    def load_state(self, thread_id: str) -> dict[str, Any]:
        path = self.state_path(thread_id)
        if not path.exists():
            return {"status": "idle", "values": {"messages": []}, "interrupts": [], "pending": None}
        with path.open(encoding="utf-8") as handle:
            return json.load(handle)

    def save_state(self, thread_id: str, state: dict[str, Any]) -> None:
        with self.state_path(thread_id).open("w", encoding="utf-8") as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2)

    def get_state(self, thread_id: str) -> dict[str, Any]:
        state = self.load_state(thread_id)
        values = append_interrupts(state["values"], state.get("interrupts", []))
        return {"status": state["status"], "values": values}

    def stream(
        self,
        thread_id: str,
        input_value: dict[str, Any] | None,
        command: dict[str, Any] | None,
        context: dict[str, Any],
    ) -> list[tuple[str, dict[str, Any]]]:
        if command:
            return self.resume(thread_id, command, context)
        if not input_value:
            raise ValueError("Missing input for stream request.")

        state = self.load_state(thread_id)
        messages = list(state["values"].get("messages", []))
        incoming = serialize(input_value.get("messages", []))
        messages.extend(incoming)

        prompt = ""
        if incoming:
            prompt = str(incoming[-1].get("content", ""))

        workspace_root = Path(context.get("workspaceRoot") or "")
        events: list[tuple[str, dict[str, Any]]] = []

        if "summary-en" in prompt and "LangGraph" in prompt and "DeepAgents" in prompt:
            summary_path = workspace_root / "blocks" / "summaries" / "summary-en.yml"
            interrupt = {
                "id": str(uuid.uuid4()),
                "value": {
                    "action_requests": [
                        {
                            "name": "edit_block_content",
                            "args": {
                                "path": str(summary_path),
                                "block_id": "summary-en",
                                "proposed_content": (
                                    "Software engineer building backend and fullstack systems for "
                                    "operational automation, commerce workflows, and AI-assisted "
                                    "products with LangGraph and DeepAgents."
                                ),
                            },
                        }
                    ]
                },
            }
            state = {
                "status": "interrupted",
                "values": {"messages": messages},
                "interrupts": [interrupt],
                "pending": {
                    "kind": "edit_summary_block",
                    "path": str(summary_path),
                    "content": interrupt["value"]["action_requests"][0]["args"]["proposed_content"],
                },
            }
            self.save_state(thread_id, state)
            events.append(("values", append_interrupts(state["values"], state["interrupts"])))
            return events

        workspace_name = workspace_root.name or "workspace"
        messages.append(
            {
                "id": str(uuid.uuid4()),
                "type": "ai",
                "content": (
                    "Stub DeepAgents runtime active. "
                    f"I can inspect the current workspace ({workspace_name}) and persist thread state locally."
                ),
            }
        )
        state = {"status": "idle", "values": {"messages": messages}, "interrupts": [], "pending": None}
        self.save_state(thread_id, state)
        events.append(("values", state["values"]))
        return events

    def resume(
        self,
        thread_id: str,
        command: dict[str, Any],
        context: dict[str, Any],
    ) -> list[tuple[str, dict[str, Any]]]:
        state = self.load_state(thread_id)
        decisions = serialize(command.get("resume", {}).get("decisions", []))
        if not decisions:
            raise ValueError("Missing resume decisions.")

        decision = decisions[0]
        pending = state.get("pending")
        if not pending:
            raise ValueError("No interrupted action is pending for this thread.")

        if decision.get("type") == "reject":
            state["interrupts"] = []
            state["pending"] = None
            state["status"] = "idle"
            state["values"]["messages"].append(
                {
                    "id": str(uuid.uuid4()),
                    "type": "ai",
                    "content": "The proposed workspace edit was rejected.",
                }
            )
            self.save_state(thread_id, state)
            return [("values", state["values"])]

        proposed_content = pending["content"]
        if decision.get("type") == "edit":
            edits = decision.get("edited_action") or {}
            proposed_content = edits.get("proposed_content", proposed_content)

        path = Path(pending["path"])
        block = load_yaml(path)
        block["content"] = proposed_content
        write_yaml(path, block)

        state["interrupts"] = []
        state["pending"] = None
        state["status"] = "idle"
        state["values"]["messages"].append(
            {
                "id": str(uuid.uuid4()),
                "type": "ai",
                "content": "Approved. I updated the summary-en block in the workspace.",
            }
        )
        self.save_state(thread_id, state)
        return [("values", state["values"])]


class DeepAgentRuntime:
    def __init__(self, model: str, data_dir: Path) -> None:
        if create_deep_agent is None or SqliteSaver is None:
            raise RuntimeError("DeepAgents dependencies are not installed.")
        self.model = model
        self.data_dir = data_dir
        self.memory_dir = data_dir / "memories"
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.memory_file = self.memory_dir / "AGENTS.md"
        if not self.memory_file.exists():
            self.memory_file.write_text("", encoding="utf-8")

        self._checkpointer_manager = SqliteSaver.from_conn_string(str(data_dir / "threads.sqlite"))
        self.checkpointer = self._checkpointer_manager.__enter__()
        self.agent = create_deep_agent(
            model=model,
            backend=self.backend_factory,
            checkpointer=self.checkpointer,
            interrupt_on={
                "write_file": True,
                "edit_file": True,
            },
            memory=["/memories/AGENTS.md"],
            system_prompt=(
                "You are Resume Studio's local AI assistant. "
                "Only edit resume content under /profile, /blocks, and /resumes. "
                "Do not modify templates, Docker files, or unrelated project files. "
                "Use /memories/AGENTS.md only for long-term memory."
            ),
        )

    def backend_factory(self, runtime: Any) -> CompositeBackend:
        context = runtime.context or {}
        workspace_root_value = context.get("workspaceRoot") or ""
        workspace_root = Path(workspace_root_value).expanduser() if workspace_root_value else None
        routes = {
            "/memories/": FilesystemBackend(root_dir=self.memory_dir, virtual_mode=True),
        }
        if workspace_root:
            routes.update(
                {
                    "/profile/": FilesystemBackend(root_dir=workspace_root / "profile", virtual_mode=True),
                    "/blocks/": FilesystemBackend(root_dir=workspace_root / "blocks", virtual_mode=True),
                    "/resumes/": FilesystemBackend(root_dir=workspace_root / "resumes", virtual_mode=True),
                }
            )
        return CompositeBackend(default=StateBackend(runtime), routes=routes)

    def get_state(self, thread_id: str) -> dict[str, Any]:
        config = {"configurable": {"thread_id": thread_id}}
        try:
            snapshot = self.agent.get_state(config)
        except Exception:
            return {"status": "idle", "values": {"messages": []}}

        values = serialize(getattr(snapshot, "values", {}) or {})
        interrupts = serialize(getattr(snapshot, "interrupts", []) or [])
        return {
            "status": "interrupted" if interrupts else "idle",
            "values": append_interrupts(values, interrupts),
        }

    def stream(
        self,
        thread_id: str,
        input_value: dict[str, Any] | None,
        command: dict[str, Any] | None,
        context: dict[str, Any],
    ) -> list[tuple[str, dict[str, Any]]]:
        config = {"configurable": {"thread_id": thread_id}}
        payload: dict[str, Any] | Command | None = input_value
        if command is not None:
            payload = Command(resume=command.get("resume"))

        if payload is None:
            raise ValueError("Missing input for stream request.")

        events: list[tuple[str, dict[str, Any]]] = []
        for chunk in self.agent.stream(
            payload,
            config=config,
            context=context,
            stream_mode="values",
        ):
            events.append(("values", serialize(chunk)))

        state = self.get_state(thread_id)
        events.append(("values", state["values"]))
        return events


class AiService:
    def __init__(self) -> None:
        self.provider = choose_provider()
        self.model = choose_model(self.provider)
        if self.provider == "stub":
            self.model = "stub"
        else:
            self.provider = provider_from_model(self.model)
        self.data_dir = Path(os.environ.get("RESUME_STUDIO_AI_DATA_DIR", ".resume-studio-ai")).expanduser()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.stub = StubRuntime(self.data_dir)
        self.deep_agent = None if self.model == "stub" else DeepAgentRuntime(self.model, self.data_dir)

    def health(self) -> dict[str, Any]:
        return {
            "baseUrl": f"http://{HOST}:{PORT}",
            "provider": self.provider,
            "model": self.model,
            "healthy": True,
        }

    def get_state(self, thread_id: str) -> dict[str, Any]:
        if self.deep_agent is None:
            return self.stub.get_state(thread_id)
        return self.deep_agent.get_state(thread_id)

    def stream(
        self,
        thread_id: str,
        input_value: dict[str, Any] | None,
        command: dict[str, Any] | None,
        context: dict[str, Any],
    ) -> list[tuple[str, dict[str, Any]]]:
        if self.deep_agent is None:
            return self.stub.stream(thread_id, input_value, command, context)
        return self.deep_agent.stream(thread_id, input_value, command, context)


class ResumeStudioHandler(BaseHTTPRequestHandler):
    server_version = "ResumeStudioAI/0.2"
    protocol_version = "HTTP/1.1"

    @property
    def service(self) -> AiService:
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


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), ResumeStudioHandler)
    server.service = AiService()  # type: ignore[attr-defined]
    server.serve_forever()


if __name__ == "__main__":
    main()
