from __future__ import annotations

import os
from pathlib import Path


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
REPO_ROOT = Path(__file__).resolve().parents[3]
MANAGED_TECTONIC_PATH = REPO_ROOT / "desktop" / "src-tauri" / "binaries" / "tectonic"


def managed_tectonic_path() -> Path:
    return MANAGED_TECTONIC_PATH


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
