#!/usr/bin/env python3
"""Serve only compact design assets and an owner-provided local data snapshot."""
import argparse
import mimetypes
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlsplit

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
parser.add_argument('--data', type=Path, required=True)
parser.add_argument('--port', type=int, default=8099)
args = parser.parse_args()
assets = args.root.resolve() / 'docs/design/prototype/compact-phone'
data = args.data.resolve()
if not data.is_file():
    parser.error('The local current-data snapshot is missing. Refresh it before showing the designs.')
allowed = {f'/docs/design/prototype/compact-phone/{name}': assets / name
           for name in ('index.html', 'ledger.html', 'weekbook.html', 'styles.css', 'app.js')}
allowed['/preview-data.js'] = data
# Hold a coherent reviewed revision; restart after changing design assets or data.
resources = {url: (file.read_bytes(), mimetypes.guess_type(str(file))[0] or 'application/octet-stream')
             for url, file in allowed.items() if file.is_file()}

class Preview(BaseHTTPRequestHandler):
    def do_GET(self):
        resource = resources.get(urlsplit(self.path).path)
        if resource is None:
            self.send_error(404)
            return
        content, content_type = resource
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, *_args):
        pass

HTTPServer(('127.0.0.1', args.port), Preview).serve_forever()
