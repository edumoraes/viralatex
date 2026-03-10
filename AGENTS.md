# Repository Guidelines

## Architecture Overview
This repository has two active product layers:

- the legacy LaTeX resume system in `src/`, compiled inside Docker for the canonical document pipeline
- the local-first desktop application in `desktop/`, built with Tauri, Rust, React, and TypeScript

The LaTeX architecture is split into four layers:

- `src/template/resume.cls`: presentation layer. Defines page geometry, typography, colors, spacing, and reusable macros such as `\makeprofile`, `\resumeentry`, and `\resumesection`.
- `src/shared/profile.tex`: shared data layer. Centralizes name, role, contacts, and links reused by every resume variant.
- `src/shared/sections/<lang>/`: content modules. Stores reusable sections by language (`pt`, `en`) such as summary, experience, projects, skills, and education.
- `src/versions/<lang>/*.tex`: composition layer. Each file is an entrypoint that assembles the class, shared profile, and selected sections for a specific resume output such as `base.tex` or `backend.tex`.

The desktop architecture is split into four layers:

- `desktop/src/`: React UI and local orchestration
- `desktop/src-tauri/src/lib.rs`: Tauri command boundary exposed to the frontend
- `desktop/src-tauri/src/`: Rust workspace, renderer, and AI sidecar orchestration
- `examples/sample-workspace/`: manifest-based local workspace contract used by the app

Build orchestration lives in `Makefile`. Runtime isolation for LaTeX lives in `Dockerfile`. Desktop validation and repository validation live in `bin/test`, `bin/pre-push-check`, the Rust test suite, Python sidecar tests, and the desktop Vitest suite.

## Technology Stack
Declared stack, versions, and usage:

- LaTeX2e: document system required by `resume.cls`.
- `resume` class version `2026/03/09`: custom class declared by `\ProvidesClass{resume}[2026/03/09 Resume layout]`.
- LuaLaTeX: compilation engine used by `latexmk -lualatex`.
- `latexmk`: build runner used to compile one or many `.tex` entrypoints.
- Debian `bookworm-slim`: base container image declared in `Dockerfile`.
- GNU Make: local task runner for `make image`, `make build`, `make test`, and cleanup targets.
- Bash: scripting language used by `bin/test`.
- Tauri 2: desktop shell and command bridge in `desktop/src-tauri/`.
- Rust: backend language for the desktop app.
- React 19 + TypeScript + Vite: frontend stack in `desktop/src/`.
- Vitest + Testing Library + jsdom: desktop frontend regression testing.
- Python 3 stdlib `unittest`: AI sidecar regression testing.
- `tectonic`: local PDF renderer used by the desktop app.

LaTeX libraries loaded in `src/template/resume.cls`:

- `geometry`: page size and margins.
- `array`, `tabularx`: tabular layout helpers.
- `enumitem`: bullet list spacing control.
- `fontenc` with `T1`: output font encoding.
- `hyperref` with `hidelinks`: clickable links without visual boxes.
- `lmodern`: Latin Modern fonts.
- `microtype`: text spacing and typographic refinement.
- `xcolor`: named color palette for text and rules.

Verified package versions installed in the current local build of `curriculo-latex:latest` (`sha256:80847c801f045d2077830cb7bcf5a32bef961887311ac6f99c7b78c99d22894b`, created on 2026-03-09):

- `latexmk` `1:4.79-1`: orchestrates incremental LaTeX builds.
- `texlive-latex-base` `2022.20230122-3`: core LaTeX packages and base tooling.
- `texlive-latex-extra` `2022.20230122-4`: extra packages required by the custom layout.
- `texlive-luatex` `2022.20230122-3`: LuaLaTeX engine support.
- `texlive-fonts-recommended` `2022.20230122-3`: recommended font packages used by TeX documents.
- `lmodern` `2.005-1`: Latin Modern font family used by the resume class.

These versions come from the built image, not from fully pinned package declarations in `Dockerfile`. Rebuilding later may change them if the Debian package index changes.

## Build, Test, and Development Commands
- `make image`: builds the Docker image `curriculo-latex`.
- `make build`: builds all variants, or one file with `make build FILE=src/versions/pt/base.tex`.
- `make build-pt`: builds all Portuguese variants.
- `make build-en`: builds all English variants.
- `make build-all`: builds every declared variant.
- `make tectonic-setup`: installs a managed local `tectonic` binary into `desktop/src-tauri/binaries/tectonic`. Pass `TECTONIC_BIN=/path/to/tectonic` when needed.
- `make test`: runs repository checks in `bin/test`.
- `RUN_DOCKER_SMOKE_TEST=1 make test`: runs an actual containerized compile after `make image`.
- `make clean`: removes `out/`.
- `npm --prefix desktop install`: installs desktop dependencies.
- `npm --prefix desktop run test`: runs desktop Vitest regression tests.
- `npm --prefix desktop run tauri:dev`: starts the desktop app. This now fails early if `tectonic` is unavailable.
- `npm --prefix desktop run tauri:build`: builds the desktop app. This also fails early if `tectonic` is unavailable.
- `python3 -m unittest discover -s desktop/ai_service/tests -p 'test_*.py'`: runs AI sidecar regression tests.
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml`: runs Rust backend tests, including renderer resolution tests.

Desktop `tectonic` setup details:

- The desktop renderer resolves `tectonic` in this order:
  1. `TECTONIC_BIN`
  2. `desktop/src-tauri/binaries/tectonic`
  3. the packaged Tauri resource directory for bundled apps
  4. `tectonic` from `PATH`
- `bin/setup-tectonic` is the canonical installer wrapper and should be preferred over manual copying.
- `bin/setup-tectonic` supports three modes:
  1. `bin/setup-tectonic /path/to/tectonic`
  2. `TECTONIC_BIN=/path/to/tectonic bin/setup-tectonic`
  3. `bin/setup-tectonic`
- In mode 3 on Linux x64, the installer first checks `PATH` for `tectonic` and, if absent, downloads it through the official installer flow.
- The managed binary directory is intentionally kept in git with `.gitkeep`, while actual binaries remain ignored.
- If `tectonic` is missing, desktop render attempts fail with an actionable error and `tauri:dev` or `tauri:build` should fail before launching or packaging.

## Coding Style & Naming Conventions
Keep content modular. Prefer editing `src/shared/sections/<lang>/` and `src/shared/profile.tex` before creating variant-specific duplication. New entrypoints belong in `src/versions/pt/` or `src/versions/en/` and should use lowercase descriptive names such as `backend.tex`.

In LaTeX files, keep `\documentclass{resume}` and `\input{profile.tex}` at the top, then compose sections in reading order. In Bash, match the existing style: `set -euo pipefail`, small assertion helpers, and direct failure messages.

Use English for all repository-facing artifacts. Documentation, code comments, identifiers when practical, commit messages, scripts, and user-facing technical error messages in the repository must be written in English.

## Collaboration Model
Work is guided by agile software development practices, specifically Extreme Programming (XP).

- Pair programming is the default mode of work.
- The user acts as the navigator and is responsible for direction, priorities, and design feedback.
- The agent acts as the driver and is responsible for implementing, testing, and refining the code.
- Architecture and design decisions should be made collaboratively, with tradeoffs stated explicitly before or during implementation when they matter.

TDD is the default development practice:

- Start by writing or updating a test that demonstrates the desired behavior or exposes the defect.
- Run the test and confirm it fails for the expected reason.
- Implement the smallest change necessary to make the test pass.
- Refactor only after the test suite is green.

## Testing & Contribution Workflow
`bin/test` verifies required files, language directories, minimum variant counts, shared template usage, and documented build entrypoints. Run `make test` on every structural change. Run the Docker smoke test whenever you change compilation behavior, Docker dependencies, or TeX inputs.

The local push gate in `bin/pre-push-check` currently runs:

- `make test`
- `python3 -m unittest discover -s desktop/ai_service/tests -p 'test_*.py'`
- `npm --prefix desktop run test`
- `npm --prefix desktop run build`
- `cargo test --manifest-path desktop/src-tauri/Cargo.toml`

Desktop testing conventions:

- Follow TDD for desktop and renderer changes too, not only for the LaTeX layer.
- For frontend regressions, prefer Vitest with Testing Library and focused mocked boundaries over broad end-to-end scaffolding.
- For AI sidecar behavior, prefer Python stdlib `unittest` with real local HTTP interaction against the sidecar process.
- For renderer/toolchain resolution, prefer Rust unit tests that isolate path resolution and failure reporting.
- Do not introduce changes to the renderer, sidecar, or Tauri command flow without automated regression coverage first, unless the user explicitly asks otherwise.

Commits currently follow Conventional Commits, for example `feat: set up LaTeX resume project`. Pull requests should state which variants changed and include regenerated PDFs when layout or content output changed.
