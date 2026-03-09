FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        latexmk \
        texlive-latex-base \
        texlive-latex-extra \
        texlive-luatex \
        texlive-fonts-recommended \
        lmodern \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["bash"]
