#!/bin/sh
# Install or update BOATS! on a Debian or Ubuntu machine, served by nginx.
#
# From a clone of the repo:
#   sudo deploy/install-debian.sh             # serve on port 80
#   sudo PORT=8080 deploy/install-debian.sh   # or any other port
#
# To update later:  git pull && sudo deploy/install-debian.sh
# Settings (environment variables):
#   PORT     port to serve on (default 80)
#   WEBROOT  where the game files go (default /var/www/boats)
set -eu

PORT="${PORT:-80}"
WEBROOT="${WEBROOT:-/var/www/boats}"
NGINX_DIR="${NGINX_DIR:-/etc/nginx}"
SITE="$NGINX_DIR/sites-available/boats"

if [ "$(id -u)" != 0 ]; then
  echo "Please run with sudo: sudo $0" >&2
  exit 1
fi
case "$PORT" in *[!0-9]*|'') echo "PORT must be a number" >&2; exit 1 ;; esac

REPO="$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -f "$REPO/web/index.html" ]; then
  echo "Can't find web/index.html next to this script. Run it from a clone of the repo." >&2
  exit 1
fi

# 1. nginx
if ! command -v nginx >/dev/null 2>&1; then
  echo "Installing nginx..."
  apt-get update
  apt-get install -y nginx
fi

# 2. Game files (replaced wholesale so deleted files don't linger)
echo "Copying the game to $WEBROOT..."
mkdir -p "$WEBROOT"
rm -rf "$WEBROOT/src" "$WEBROOT/vendor"
cp "$REPO/web/index.html" "$WEBROOT/"
cp -r "$REPO/web/src" "$REPO/web/vendor" "$WEBROOT/"
chmod -R a+rX "$WEBROOT"

# 3. nginx site, from deploy/nginx.conf with the port and folder filled in
sed -e "s|listen 80;|listen $PORT;|" -e "s|root /var/www/boats;|root $WEBROOT;|" "$REPO/deploy/nginx.conf" > "$SITE"
ln -sf "$SITE" "$NGINX_DIR/sites-enabled/boats"

# nginx's stock welcome page also wants port 80; step it aside if it's in the way.
if [ "$PORT" = 80 ] && [ -L "$NGINX_DIR/sites-enabled/default" ]; then
  echo "Disabling nginx's default welcome site so BOATS! can use port 80."
  rm "$NGINX_DIR/sites-enabled/default"
fi

nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
if systemctl is-active --quiet nginx; then systemctl reload nginx; else systemctl start nginx; fi

# 4. Where to find it
suffix=""
[ "$PORT" != 80 ] && suffix=":$PORT"
echo
echo "BOATS! is up:"
echo "  http://localhost$suffix/"
for ip in $(hostname -I 2>/dev/null); do
  case "$ip" in *:*) ;; *) echo "  http://$ip$suffix/" ;; esac
done
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
  echo
  echo "Note: ufw is active. To allow other machines in: sudo ufw allow $PORT/tcp"
fi
