# Resume Studio Bootstrap

This repository now contains two complementary layers:

- the original LaTeX engine in `src/`, still useful as a reference and template base
- the local-first desktop application in `desktop/`, including a Python AI sidecar backed by DeepAgents

The immediate goal is to validate the product foundation with `Tauri + Rust + React + TypeScript`, using a manifest-versioned local workspace, form-based local CRUD, workspace-local operational persistence, and real local rendering through `tectonic`.

## Desktop Bootstrap

The desktop app lives in `desktop/` and assumes:

- `filesystem` as the canonical source of user data
- a stable workspace contract rooted at `workspace.yml`
- workspace-local operational state in `.app/`
- `SQLite` only as a future operational and indexing layer
- `tectonic` as the local PDF rendering engine
- a local Python AI sidecar for prompt-driven workspace assistance
- a sample workspace in `examples/sample-workspace/`

### AI sidecar runtime

The desktop app now starts a local AI sidecar that exposes a LangGraph-compatible stream endpoint for the chat panel.

- `desktop/ai_service/server.py`: Python HTTP sidecar exposing `/health`, `/stream`, and `/threads/:id/state`
- `deepagents`: agent runtime used when `RESUME_STUDIO_AI_MODEL` resolves to a provider-backed model
- `langgraph-checkpoint-sqlite`: thread checkpoint persistence for sidecar conversation state
- `desktop/src-tauri/src/ai_service.rs`: Tauri launcher that starts the sidecar and assigns an app-local data directory
- `desktop/src/App.tsx`: React chat client using `@langchain/langgraph-sdk/react`

Runtime behavior:

- the sidecar chooses its model from `RESUME_STUDIO_AI_MODEL`, `OPENAI_API_KEY`, or Ollama-related environment variables
- provider-backed runs use DeepAgents with filesystem-scoped access to `/profile`, `/blocks`, `/resumes`, and `/memories/AGENTS.md`
- write operations are interrupt-driven and require explicit approval from the desktop UI before the workspace is mutated
- thread state is persisted locally and can be reloaded after restarting the sidecar
- when no provider is configured, the sidecar falls back to a local stub runtime that preserves the same thread and approval shape for development

### Workspace contract

Each workspace now has an explicit root manifest plus entity folders:

```text
workspace.yml
.app/
  state.yml
  render-history.yml
profile/
blocks/
  _archived/
resumes/
  _archived/
renders/
```

- `workspace.yml`: stable contract entrypoint with `schemaVersion`, `workspaceId`, `workspaceName`, and `defaultTemplateId`
- `profile/profile.yml`: singleton profile document
- `blocks/**/*.yml`: active reusable content blocks
- `resumes/*.yml`: active resume definitions
- `blocks/_archived` and `resumes/_archived`: soft-deleted entities
- `.app/render-history.yml`: persisted render history
- `.app/state.yml`: minimal workspace-local app state such as last selected resume

### New structure

```text
desktop/
  src/
  src-tauri/
examples/
  sample-workspace/
src/
  template/
  shared/
  versions/
```

### Bootstrap requirements

- Node.js + npm
- Rust toolchain
- Python 3.12+
- `uv` for sidecar dependency sync
- managed `tectonic` binary in `desktop/src-tauri/binaries/tectonic`, or a custom path via `TECTONIC_BIN`

### Bootstrap commands

```bash
cd desktop
npm install
npm run tauri:dev
```

Set up the AI sidecar environment before using the desktop chat or running sidecar tests:

```bash
uv sync --directory desktop/ai_service
```

The Tauri backend prefers `desktop/ai_service/.venv/bin/python` and falls back to `python3` or `python` from `PATH` only when the managed virtualenv is absent.

Before rendering resumes, install or register a local `tectonic` binary for the desktop app:

```bash
bin/setup-tectonic
```

The installer works in three modes:

1. `bin/setup-tectonic /path/to/tectonic`
2. `TECTONIC_BIN=/path/to/tectonic bin/setup-tectonic`
3. `bin/setup-tectonic`
   On Linux x64, this will try the local `PATH` first and then download `tectonic` via the official installer if it is still missing.

If `tectonic` is already in your `PATH`, you can also run:

```bash
make tectonic-setup
```

To use a specific `tectonic` binary without copying it into the managed location:

```bash
TECTONIC_BIN=/path/to/tectonic npm run tauri:dev
```

The desktop app resolves `tectonic` in this order:

1. `TECTONIC_BIN`
2. `desktop/src-tauri/binaries/tectonic`
3. bundled app resource path for packaged builds
4. `tectonic` from `PATH`

The managed local binary at `desktop/src-tauri/binaries/tectonic` is the preferred path for Linux development and future app packaging.

Both `npm --prefix desktop run tauri:dev` and `npm --prefix desktop run tauri:build` now fail early with an actionable message if `tectonic` is unavailable.

### AI chat workflow

The desktop chat now uses a persistent thread model instead of the previous stateless message streaming.

1. The frontend starts the sidecar through Tauri and receives `baseUrl`, `provider`, and `model`.
2. The chat panel opens a LangGraph stream against `/stream` and keeps a local `threadId` in `localStorage`.
3. The sidecar returns `values` events containing serialized messages and optional `__interrupt__` actions.
4. If the agent proposes a workspace edit, the UI shows the target path and proposed content for approval, edit-and-approve, or rejection.
5. The selected decision is sent back as a resume command so the sidecar can continue or discard the pending mutation.
6. The current thread state can be rehydrated from `/threads/:id/state` after restarting the app or sidecar.

## Local quality workflow

The repository uses `pre-commit` for local hook orchestration and shared quality checks.

Required local tools:

- `pre-commit`
- Node.js + npm
- Rust toolchain with `clippy` and `rustfmt`
- `cargo-audit`
- Python 3.12+
- `uv`

Install the local workflow:

```bash
npm --prefix desktop install
cargo install cargo-audit
pipx install pre-commit
uv sync --directory desktop/ai_service
make tectonic-setup TECTONIC_BIN=/path/to/tectonic
make hooks-install
```

Run the checks manually:

```bash
make lint
make security
make check
make hooks-run
```

Hook behavior:

- `pre-commit`: file hygiene, YAML/JSON/TOML validation, secret detection, shell checks, frontend lint, Rust formatting, and Rust clippy
- `pre-push`: `make test`, renderer and sidecar regression tests, `npm --prefix desktop run build`, and `cargo test --manifest-path desktop/src-tauri/Cargo.toml`

The app creates or opens a local workspace, edits profile, blocks, and resume definitions through structured forms, persists render history inside the workspace, and renders PDFs into the workspace `renders/` directory.

## Legacy LaTeX Engine

LaTeX project for maintaining multiple resume variants with a shared base, bilingual support, and Docker-based compilation.

The build configures `TEXINPUTS` automatically so shared classes and sections can be resolved without fragile relative paths. Compilation still uses LuaLaTeX by default to preserve Unicode text and pt-BR glyphs in the final PDF.

## Estrutura

```text
src/
  shared/
    profile.tex
    sections/
      pt/
      en/
  template/
    resume.cls
  versions/
    pt/
    en/
out/
```

- `src/template/resume.cls`: layout, macros compartilhadas e configuração tipográfica compatível com LuaLaTeX.
- `src/shared/profile.tex`: identidade, contatos e links reutilizaveis.
- `src/shared/sections/<idioma>/`: secoes reutilizaveis por idioma.
- `src/versions/<idioma>/`: pontos de entrada compilaveis para cada variante.
- `out/`: PDFs e artefatos de build. Os arquivos compilados recebem prefixo do idioma, por exemplo `pt-base.pdf` e `en-base.pdf`.

## Requisitos

- Docker
- GNU Make

## Uso

Construir a imagem:

```bash
make image
```

Gerar todas as versoes:

```bash
make build
make build-all
```

Isso produz artefatos distintos por idioma e variante em `out/`, como `pt-base.pdf`, `en-base.pdf`, `pt-backend.pdf` e `en-backend.pdf`.

Gerar apenas as versoes em portugues:

```bash
make build-pt
```

Gerar apenas as versoes em ingles:

```bash
make build-en
```

Remover arquivos gerados:

```bash
make clean
```

Rodar os testes automatizados:

```bash
make test
```

## Adicionando uma nova variante

1. Crie um novo arquivo em `src/versions/pt/` ou `src/versions/en/`.
2. Use uma das variantes existentes como base.
3. Misture as secoes compartilhadas com blocos especificos da vaga quando necessario.
4. Rode `make build-all` ou compile a variante desejada via `make build FILE=src/versions/...`.

## Modelo de manutencao

- Edite `src/shared/profile.tex` para contatos e links.
- Edite `src/shared/sections/pt/` e `src/shared/sections/en/` para atualizar o conteudo comum.
- Crie blocos extras por variante quando quiser enfatizar um perfil especifico sem duplicar o layout inteiro.

## Comando de build ad hoc

Para compilar um arquivo especifico:

```bash
make build FILE=src/versions/pt/base.tex
```

Sem `FILE`, `make build` compila todas as variantes. Com `FILE`, o PDF tambem e gerado com prefixo do idioma, por exemplo `out/pt-base.pdf`.

## Testes

O runner `bin/test` valida:

- presenca da estrutura obrigatoria do projeto
- variantes minimas em portugues e ingles
- uso do template e perfil compartilhados
- integridade basica dos alvos de build

Para incluir um smoke test de compilacao real via Docker:

```bash
make image
RUN_DOCKER_SMOKE_TEST=1 make test
```
