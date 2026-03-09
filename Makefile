IMAGE_NAME ?= curriculo-latex
LATEXMK ?= latexmk
LATEXMK_ENGINE ?= -pdf
FILE ?=
TEXINPUTS_VALUE = /workspace/src/template//:/workspace/src/shared//:/workspace/src/shared/sections//:

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
		$(LATEXMK) $(LATEXMK_ENGINE) -interaction=nonstopmode -halt-on-error -output-directory=out $(FILE)
endif

build-pt:
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc '$(LATEXMK) $(LATEXMK_ENGINE) -interaction=nonstopmode -halt-on-error -output-directory=out src/versions/pt/*.tex'

build-en:
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc '$(LATEXMK) $(LATEXMK_ENGINE) -interaction=nonstopmode -halt-on-error -output-directory=out src/versions/en/*.tex'

build-all:
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc '$(LATEXMK) $(LATEXMK_ENGINE) -interaction=nonstopmode -halt-on-error -output-directory=out src/versions/pt/*.tex src/versions/en/*.tex'

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
