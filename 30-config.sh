#!/bin/sh
# Генерирует config.js из переменной окружения BACKEND_URL при старте контейнера.
set -e
echo "window.API_BASE='${BACKEND_URL:-}';" > /usr/share/nginx/html/config.js
echo "[entrypoint] config.js -> API_BASE='${BACKEND_URL:-<empty>}'"
