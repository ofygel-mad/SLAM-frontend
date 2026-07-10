#!/bin/sh
# Генерирует config.js из переменной окружения BACKEND_URL при старте контейнера.
set -e
api_base="${BACKEND_URL:-}"
escaped_api_base="$(printf '%s' "$api_base" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf 'window.API_BASE="%s";\n' "$escaped_api_base" > /usr/share/nginx/html/config.js
echo "[entrypoint] config.js -> API_BASE='${api_base:-<empty>}'"
