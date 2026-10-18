"""Serve assessor locally without browser caching, so edits show up on reload.

Usage: python3 serve.py [port]   (default 8642), then open http://127.0.0.1:8642/
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
    root = os.path.dirname(os.path.abspath(__file__))
    handler = functools.partial(NoCacheHandler, directory=root)
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"assessor at http://127.0.0.1:{port}/")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
