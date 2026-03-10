from __future__ import annotations

import os
import shutil
import subprocess
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

import yaml

from .config import managed_tectonic_path

try:
    from langchain.tools import ToolRuntime, tool
except Exception:
    ToolRuntime = tool = None


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


def resolve_template_root(workspace_root: Path, template_id: str) -> Path:
    template_root = (workspace_root / "templates" / template_id).resolve()
    templates_root = (workspace_root / "templates").resolve()
    try:
        template_root.relative_to(templates_root)
    except ValueError as error:
        raise ValueError(f"Template id resolves outside templates root: {template_id}") from error
    if not template_root.is_dir():
        raise FileNotFoundError(f"Unknown template id: {template_id}")
    return template_root


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def write_yaml(path: Path, value: dict[str, Any]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(value, handle, sort_keys=False, allow_unicode=True)


def resolve_template_manifest(workspace_root: Path, template_id: str) -> tuple[Path, dict[str, Any]]:
    template_root = resolve_template_root(workspace_root, template_id)
    manifest_path = template_root / "template.yml"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Missing template manifest: {manifest_path}")
    return template_root, load_yaml(manifest_path)


def resolve_template_entrypoint(template_root: Path, manifest: dict[str, Any], entrypoint: str | None) -> Path:
    chosen_entrypoint = (entrypoint or manifest.get("entrypoint") or "").strip()
    if not chosen_entrypoint:
        raise ValueError("Template manifest must define a non-empty entrypoint.")

    candidate = (template_root / chosen_entrypoint).resolve()
    try:
        candidate.relative_to(template_root.resolve())
    except ValueError as error:
        raise ValueError("Requested entrypoint is outside the template root.") from error
    if not candidate.is_file():
        raise FileNotFoundError(f"Template entrypoint does not exist: {candidate}")
    return candidate


def failed_compile_result(
    template_id: str,
    entrypoint: str | None,
    error_message: str,
) -> dict[str, Any]:
    return {
        "status": "failed",
        "template_id": template_id,
        "entrypoint": entrypoint,
        "output_path": None,
        "log_path": None,
        "error_message": error_message,
    }


def compile_workspace_template(
    workspace_root: Path,
    template_id: str,
    entrypoint: str | None = None,
    job_name: str | None = None,
) -> dict[str, Any]:
    try:
        template_root, manifest = resolve_template_manifest(workspace_root, template_id)
        entrypoint_path = resolve_template_entrypoint(template_root, manifest, entrypoint)
        tectonic_path = resolve_tectonic_path()
    except (FileNotFoundError, ValueError) as error:
        return failed_compile_result(template_id, entrypoint, str(error))

    job_id = job_name.strip() if job_name and job_name.strip() else f"template-{int(time.time() * 1000)}"
    output_dir = workspace_root / "renders" / "agent" / job_id
    output_dir.mkdir(parents=True, exist_ok=True)
    log_path = output_dir / "render.log"

    with TemporaryDirectory() as temp_dir:
        compile_root = Path(temp_dir) / template_id
        shutil.copytree(template_root, compile_root)
        compile_entrypoint = compile_root / entrypoint_path.relative_to(template_root)
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
                template_id,
                compile_target,
                f"Failed to execute tectonic: {error}",
            )

    log_body = f"stdout:\n{completed.stdout}\n\nstderr:\n{completed.stderr}"
    log_path.write_text(log_body, encoding="utf-8")

    output_path = output_dir / f"{compile_entrypoint.stem}.pdf"
    if completed.returncode != 0:
        return {
            "status": "failed",
            "template_id": template_id,
            "entrypoint": compile_target,
            "output_path": None,
            "log_path": str(log_path),
            "error_message": "Tectonic failed to compile the requested template.",
        }

    if not output_path.is_file():
        fallback_pdf = output_dir / "resume.pdf"
        if fallback_pdf.is_file():
            output_path = fallback_pdf
        else:
            return {
                "status": "failed",
                "template_id": template_id,
                "entrypoint": compile_target,
                "output_path": None,
                "log_path": str(log_path),
                "error_message": f"Tectonic finished without producing a PDF at {output_path}.",
            }

    return {
        "status": "completed",
        "template_id": template_id,
        "entrypoint": compile_target,
        "output_path": str(output_path),
        "log_path": str(log_path),
        "error_message": None,
    }


if tool is not None:

    @tool(parse_docstring=True)
    def compile_latex_template(
        template_id: str,
        entrypoint: str | None = None,
        job_name: str | None = None,
        runtime: ToolRuntime | None = None,
    ) -> dict[str, Any]:
        """Compile a LaTeX template from the active workspace.

        Args:
            template_id: Template identifier under `/templates/<template_id>/`.
            entrypoint: Optional relative `.tex` entrypoint inside the template directory.
            job_name: Optional output folder name under `/renders/agent/`.
            runtime: Injected tool runtime carrying the active workspace context.
        """

        context = getattr(runtime, "context", {}) if runtime is not None else {}
        workspace_root_value = str((context or {}).get("workspaceRoot") or "").strip()
        if not workspace_root_value:
            return failed_compile_result(
                template_id,
                entrypoint,
                "No workspaceRoot was provided to the compile_latex_template tool.",
            )
        return compile_workspace_template(
            Path(workspace_root_value).expanduser(),
            template_id,
            entrypoint=entrypoint,
            job_name=job_name,
        )
else:
    compile_latex_template = None
