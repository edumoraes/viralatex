#!/usr/bin/env python3

from __future__ import annotations

from sidecar import (
    APP_TEMPLATES_PATH,
    AiService,
    DeepAgentRuntime,
    DEFAULT_ANTHROPIC_MODEL,
    DEFAULT_OLLAMA_MODEL,
    DEFAULT_OPENAI_MODEL,
    HOST,
    MANAGED_TECTONIC_PATH,
    PORT,
    ResumeStudioHandler,
    SUPPORTED_MODELS,
    StubRuntime,
    app_templates_path,
    choose_model,
    choose_provider,
    compile_latex_document,
    compile_workspace_document,
    failed_compile_result,
    load_yaml,
    managed_tectonic_path,
    provider_from_model,
    resolve_document_path,
    resolve_tectonic_path,
    workspace_root_from_runtime,
    workspace_backend_routes,
    write_yaml,
)
from sidecar.app import main

__all__ = [
    "AiService",
    "APP_TEMPLATES_PATH",
    "DeepAgentRuntime",
    "DEFAULT_ANTHROPIC_MODEL",
    "DEFAULT_OLLAMA_MODEL",
    "DEFAULT_OPENAI_MODEL",
    "HOST",
    "MANAGED_TECTONIC_PATH",
    "PORT",
    "ResumeStudioHandler",
    "SUPPORTED_MODELS",
    "StubRuntime",
    "app_templates_path",
    "choose_model",
    "choose_provider",
    "compile_latex_document",
    "compile_workspace_document",
    "failed_compile_result",
    "load_yaml",
    "main",
    "managed_tectonic_path",
    "provider_from_model",
    "resolve_document_path",
    "resolve_tectonic_path",
    "workspace_root_from_runtime",
    "workspace_backend_routes",
    "write_yaml",
]


if __name__ == "__main__":
    main()
