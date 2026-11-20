#!/usr/bin/env python3
"""Dev server for the web game. Like `python3 -m http.server`, but tells browsers not to cache,
so a normal refresh always picks up code changes."""
import http.server
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
