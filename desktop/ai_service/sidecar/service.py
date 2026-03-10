from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from .config import HOST, PORT, choose_model, choose_provider, provider_from_model
from .runtimes import DeepAgentRuntime, StubRuntime


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
    ) -> Iterator[tuple[str, Any]]:
        if self.deep_agent is None:
            yield from self.stub.stream(thread_id, input_value, command, context)
            return
        yield from self.deep_agent.stream(thread_id, input_value, command, context)
