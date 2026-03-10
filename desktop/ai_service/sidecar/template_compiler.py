from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path
from pathlib import PurePosixPath
from tempfile import TemporaryDirectory
from typing import Any

import yaml

from .config import managed_tectonic_path

try:
    from langchain.tools import ToolRuntime, tool
    from pydantic import BaseModel, Field
except Exception:
    ToolRuntime = tool = BaseModel = Field = None


def resolve_tectonic_path() -> Path:
    env_override = os.environ.get("TECTONIC_BIN", "").strip()
    if env_override:
        candidate = Path(env_override).expanduser()
        if candidate.is_file():
            return candidate

    managed = managed_tectonic_path()
    if managed.is_file():
        return managed

    system_path = shutil.which("tectonic")
    if system_path:
        return Path(system_path)

    raise FileNotFoundError(
        "Tectonic executable not found. Run 'bin/setup-tectonic /path/to/tectonic' or set TECTONIC_BIN before rendering."
    )


def documents_root(workspace_root: Path) -> Path:
    return (workspace_root / "documents").resolve()


def normalize_document_path(document_path: str) -> str:
    normalized = PurePosixPath(document_path.strip())
    parts = [part for part in normalized.parts if part not in {"", "/"}]
    if parts[:1] == ["documents"]:
        parts = parts[1:]
    return PurePosixPath(*parts).as_posix() if parts else ""


def resolve_document_path(workspace_root: Path, document_path: str) -> Path:
    docs_root = documents_root(workspace_root)
    candidate = (docs_root / normalize_document_path(document_path)).resolve()
    try:
        candidate.relative_to(docs_root)
    except ValueError as error:
        raise ValueError("Requested document is outside the documents root.") from error
    if not candidate.is_file():
        raise FileNotFoundError(f"Document entrypoint does not exist: {candidate}")
    return candidate


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def write_yaml(path: Path, value: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(value, handle, sort_keys=False, allow_unicode=True)


def failed_compile_result(
    document_path: str | None,
    error_message: str,
) -> dict[str, Any]:
    return {
        "status": "failed",
        "document_path": document_path,
        "output_path": None,
        "log_path": None,
        "error_message": error_message,
    }


if BaseModel is not None:

    class CompileLatexDocumentArgs(BaseModel):
        document_path: str = Field(description="Relative `.tex` path under `/documents/`.")
        job_name: str | None = Field(
            default=None,
            description="Optional output folder name under `/renders/agent/`.",
        )
else:
    CompileLatexDocumentArgs = None


def workspace_root_from_runtime(runtime: Any) -> str:
    context = getattr(runtime, "context", None)
    if isinstance(context, dict):
        value = str(context.get("workspaceRoot") or "").strip()
        if value:
            return value
    else:
        value = str(getattr(context, "workspaceRoot", "") or "").strip()
        if value:
            return value

    config = getattr(runtime, "config", None)
    if isinstance(config, dict):
        direct = str(config.get("workspaceRoot") or "").strip()
        if direct:
            return direct
        nested_context = config.get("context")
        if isinstance(nested_context, dict):
            value = str(nested_context.get("workspaceRoot") or "").strip()
            if value:
                return value
        configurable = config.get("configurable")
        if isinstance(configurable, dict):
            value = str(configurable.get("workspaceRoot") or "").strip()
            if value:
                return value
    return ""


def compile_workspace_document(
    workspace_root: Path,
    document_path: str,
    job_name: str | None = None,
) -> dict[str, Any]:
    normalized_document_path = normalize_document_path(document_path)
    try:
        entrypoint_path = resolve_document_path(workspace_root, normalized_document_path)
        docs_root = documents_root(workspace_root)
        tectonic_path = resolve_tectonic_path()
    except (FileNotFoundError, ValueError) as error:
        return failed_compile_result(document_path, str(error))

    job_id = job_name.strip() if job_name and job_name.strip() else f"document-{int(time.time() * 1000)}"
    output_dir = workspace_root / "renders" / "agent" / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / "render.log"

    with TemporaryDirectory() as temp_dir:
        compile_root = Path(temp_dir) / "documents"
        shutil.copytree(docs_root, compile_root)
        compile_entrypoint = compile_root / entrypoint_path.relative_to(docs_root)
        compile_target = compile_entrypoint.relative_to(compile_root).as_posix()
        try:
            completed = subprocess.run(
                [
                    str(tectonic_path),
                    "-Z",
                    f"search-path={compile_root}",
                    "-o",
                    str(output_dir),
                    compile_target,
                ],
                cwd=compile_root,
                capture_output=True,
                text=True,
                check=False,
            )
        except OSError as error:
            return failed_compile_result(
                normalized_document_path or document_path,
                f"Failed to execute tectonic: {error}",
            )

    log_body = f"stdout:\n{completed.stdout}\n\nstderr:\n{completed.stderr}"
    log_path.write_text(log_body, encoding="utf-8")

    output_path = output_dir / f"{compile_entrypoint.stem}.pdf"
    if completed.returncode != 0:
        return {
            "status": "failed",
            "document_path": compile_target,
            "output_path": None,
            "log_path": str(log_path),
            "error_message": "Tectonic failed to compile the requested document.",
        }

    if not output_path.is_file():
        fallback_pdf = output_dir / "resume.pdf"
        if fallback_pdf.is_file():
            output_path = fallback_pdf
        else:
            return {
                "status": "failed",
                "document_path": compile_target,
                "output_path": None,
                "log_path": str(log_path),
                "error_message": f"Tectonic finished without producing a PDF at {output_path}.",
            }

    return {
        "status": "completed",
        "document_path": compile_target,
        "output_path": str(output_path),
        "log_path": str(log_path),
        "error_message": None,
    }


if tool is not None and CompileLatexDocumentArgs is not None:

    @tool(
        args_schema=CompileLatexDocumentArgs,
        description="Compile a LaTeX document from the active workspace.",
    )
    def compile_latex_document(
        document_path: str,
        job_name: str | None = None,
        runtime: ToolRuntime = None,
    ) -> dict[str, Any]:
        workspace_root_value = workspace_root_from_runtime(runtime) if runtime is not None else ""
        if not workspace_root_value:
            return failed_compile_result(
                document_path,
                "No workspaceRoot was provided to the compile_latex_document tool.",
            )
        return compile_workspace_document(
            Path(workspace_root_value).expanduser(),
            document_path=document_path,
            job_name=job_name,
        )
else:
    compile_latex_document = None
