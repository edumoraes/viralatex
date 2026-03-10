from __future__ import annotations

import json
import time
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from .serialization import append_interrupts, chunk_text, serialize
from .template_compiler import compile_latex_template

try:
    from deepagents import create_deep_agent
    from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend
    from langgraph.checkpoint.sqlite import SqliteSaver
    from langgraph.types import Command
except Exception:
    create_deep_agent = None
    CompositeBackend = FilesystemBackend = StateBackend = SqliteSaver = Command = None


def workspace_backend_routes(workspace_root: Path) -> dict[str, Any]:
    if FilesystemBackend is None:
        return {
            "/templates/": workspace_root / "templates",
            "/profile/": workspace_root / "profile",
            "/blocks/": workspace_root / "blocks",
            "/resumes/": workspace_root / "resumes",
        }
    return {
        "/templates/": FilesystemBackend(root_dir=workspace_root / "templates", virtual_mode=True),
        "/profile/": FilesystemBackend(root_dir=workspace_root / "profile", virtual_mode=True),
        "/blocks/": FilesystemBackend(root_dir=workspace_root / "blocks", virtual_mode=True),
        "/resumes/": FilesystemBackend(root_dir=workspace_root / "resumes", virtual_mode=True),
    }


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
    ) -> Iterator[tuple[str, Any]]:
        if command:
            yield from self.resume(thread_id, command, context)
            return
        if not input_value:
            raise ValueError("Missing input for stream request.")

        state = self.load_state(thread_id)
        messages = list(state["values"].get("messages", []))
        incoming = serialize(input_value.get("messages", []))
        messages.extend(incoming)
        workspace_root = Path(context.get("workspaceRoot") or "")

        workspace_name = workspace_root.name or "workspace"
        assistant_id = str(uuid.uuid4())
        assistant_content = (
            "Stub DeepAgents runtime active. "
            f"I can inspect the current workspace ({workspace_name}), read workspace-owned templates, "
            "and persist thread state locally."
        )
        for piece in chunk_text(assistant_content):
            yield (
                "messages",
                [
                    {
                        "id": assistant_id,
                        "type": "AIMessageChunk",
                        "content": piece,
                    },
                    {},
                ],
            )
            time.sleep(0.01)

        messages.append(
            {
                "id": assistant_id,
                "type": "ai",
                "content": assistant_content,
            }
        )
        state = {"status": "idle", "values": {"messages": messages}, "interrupts": [], "pending": None}
        self.save_state(thread_id, state)
        yield ("values", state["values"])

    def resume(
        self,
        thread_id: str,
        command: dict[str, Any],
        context: dict[str, Any],
    ) -> Iterator[tuple[str, Any]]:
        raise ValueError("The stub runtime does not support interrupted mutations.")


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
            tools=[compile_latex_template] if compile_latex_template is not None else [],
            backend=self.backend_factory,
            checkpointer=self.checkpointer,
            interrupt_on={
                "write_file": True,
                "edit_file": True,
            },
            memory=["/memories/AGENTS.md"],
            system_prompt=(
                "You are Resume Studio's local AI assistant. "
                "You only have access to the active workspace filesystem and must treat it as the full scope of work. "
                "Do not assume access to repository files, app infrastructure, or any paths outside the active workspace. "
                "The active workspace is the source of truth. "
                "Use the native Deep Agents file tools only for workspace files under /templates, /profile, /blocks, and /resumes. "
                "Inspect /templates first when the user asks for LaTeX output, and reuse existing template fragments before creating new ones. "
                "When editing files under /templates, expect LaTeX source files such as .tex and manifest files such as template.yml; preserve valid LaTeX and YAML syntax, keep entrypoints and relative paths inside the template root, and avoid introducing broken references. "
                "When editing /profile, /blocks, or /resumes, preserve the existing file format and produce syntactically valid content for that file type. "
                "Use compile_latex_template when the user asks you to compile a workspace template. "
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
            routes.update(workspace_backend_routes(workspace_root))
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
    ) -> Iterator[tuple[str, Any]]:
        config = {"configurable": {"thread_id": thread_id}}
        payload: dict[str, Any] | Command | None = input_value
        if command is not None:
            payload = Command(resume=command.get("resume"))

        if payload is None:
            raise ValueError("Missing input for stream request.")

        if command is not None:
            for chunk in self.agent.stream(
                payload,
                config=config,
                context=context,
                stream_mode="values",
            ):
                yield ("values", serialize(chunk))
        else:
            for chunk in self.agent.stream(
                payload,
                config=config,
                context=context,
                stream_mode="messages",
            ):
                if not isinstance(chunk, tuple) or len(chunk) != 2:
                    continue
                message, metadata = chunk
                yield ("messages", [serialize(message), serialize(metadata)])

        state = self.get_state(thread_id)
        yield ("values", state["values"])
