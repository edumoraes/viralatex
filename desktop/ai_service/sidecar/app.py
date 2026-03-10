from __future__ import annotations

from http.server import ThreadingHTTPServer

from .config import HOST, PORT
from .http_api import ResumeStudioHandler
from .service import AiService


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), ResumeStudioHandler)
    server.service = AiService()  # type: ignore[attr-defined]
    server.serve_forever()
