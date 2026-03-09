# Resume Studio Bootstrap

This repository now contains two complementary layers:

- the original LaTeX engine in `src/`, still useful as a reference and template base
- the bootstrap of the new local-first desktop application in `desktop/`

The immediate goal is to validate the product foundation with `Tauri + Rust + React + TypeScript`, using a filesystem-backed workspace and real local rendering through `tectonic`.

## Desktop Bootstrap

The desktop app lives in `desktop/` and assumes:

- `filesystem` as the canonical source of user data
- `SQLite` only as a future operational and indexing layer
- `tectonic` as the local PDF rendering engine
- a sample workspace in `examples/sample-workspace/`

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
- bundled `tectonic` binary in `desktop/src-tauri/binaries/tectonic`, or a custom path via `TECTONIC_BIN`

### Bootstrap commands

```bash
cd desktop
npm install
npm run tauri:dev
```

To use a specific `tectonic` binary:

```bash
TECTONIC_BIN=/path/to/tectonic npm run tauri:dev
```

The bootstrap already supports a bundled local binary at `desktop/src-tauri/binaries/tectonic`, which is the preferred model for future app distribution.

The app creates or opens a local workspace, lists blocks and resume definitions, and attempts to render a real PDF into the workspace `renders/` directory.

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
