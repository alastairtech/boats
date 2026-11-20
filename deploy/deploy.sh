#!/bin/sh
# Copy the game to a server over SSH, for any web server that serves static files.
# Usage: deploy/deploy.sh user@host:/var/www/boats
set -e
[ -n "$1" ] || { echo "usage: $0 user@host:/path/to/webroot" >&2; exit 1; }
cd "$(dirname "$0")/../web"
rsync -avz --delete --exclude serve.py --exclude .gdignore index.html src vendor "$1/"
echo "Deployed to $1"
