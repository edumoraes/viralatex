IMAGE_NAME ?= curriculo-latex
LATEXMK ?= latexmk
FILE ?=
TEXINPUTS_VALUE = /workspace/src/template//:/workspace/src/shared//:/workspace/src/shared/sections//:

.PHONY: image build build-all build-pt build-en test clean shell

image:
	docker build -t $(IMAGE_NAME) .

build:
	test -n "$(FILE)"
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		$(LATEXMK) -lualatex -interaction=nonstopmode -halt-on-error -output-directory=out $(FILE)

build-pt:
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc '$(LATEXMK) -lualatex -interaction=nonstopmode -halt-on-error -output-directory=out src/versions/pt/*.tex'

build-en:
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc '$(LATEXMK) -lualatex -interaction=nonstopmode -halt-on-error -output-directory=out src/versions/en/*.tex'

build-all:
	mkdir -p out
	docker run --rm \
		-v "$(CURDIR):/workspace" \
		-w /workspace \
		-e TEXINPUTS="$(TEXINPUTS_VALUE)" \
		$(IMAGE_NAME) \
		sh -lc '$(LATEXMK) -lualatex -interaction=nonstopmode -halt-on-error -output-directory=out src/versions/pt/*.tex src/versions/en/*.tex'

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
