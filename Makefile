IMAGE_NAME ?= curriculo-latex
LATEXMK ?= latexmk
LATEXMK_ENGINE ?= -lualatex
FILE ?=
TEXINPUTS_VALUE = /workspace/src/template//:/workspace/src/shared//:/workspace/src/shared/sections//:
LATEXMK_FLAGS = $(LATEXMK_ENGINE) -interaction=nonstopmode -halt-on-error -output-directory=out

.PHONY: image build build-all build-pt build-en test clean shell

image:
	docker build -t $(IMAGE_NAME) .

build:
	mkdir -p out
ifeq ($(strip $(FILE)),)
	$(MAKE) build-all
else
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc 'file="$(FILE)"; lang="$$(basename "$$(dirname "$$file")")"; name="$$(basename "$$file" .tex)"; $(LATEXMK) $(LATEXMK_FLAGS) -jobname="$$lang-$$name" "$$file"'
endif

build-pt:
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc 'for file in src/versions/pt/*.tex; do name="$$(basename "$$file" .tex)"; $(LATEXMK) $(LATEXMK_FLAGS) -jobname="pt-$$name" "$$file"; done'

build-en:
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc 'for file in src/versions/en/*.tex; do name="$$(basename "$$file" .tex)"; $(LATEXMK) $(LATEXMK_FLAGS) -jobname="en-$$name" "$$file"; done'

build-all:
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc 'for file in src/versions/pt/*.tex src/versions/en/*.tex; do lang="$$(basename "$$(dirname "$$file")")"; name="$$(basename "$$file" .tex)"; $(LATEXMK) $(LATEXMK_FLAGS) -jobname="$$lang-$$name" "$$file"; done'

test:
	bin/test

clean:
	rm -rf out

shell:
	docker run --rm -it \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		$(IMAGE_NAME) \
		bash
