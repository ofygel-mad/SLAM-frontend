# Статический фронтенд на nginx.
# Слушает порт из $PORT (Railway), адрес бэкенда берёт из $BACKEND_URL.
FROM nginx:alpine

# Шаблон конфига nginx (образ nginx подставит ${PORT} через envsubst при старте).
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Статика
COPY index.html app.js /usr/share/nginx/html/

# Скрипт генерации config.js из BACKEND_URL (выполняется перед запуском nginx)
COPY 30-config.sh /docker-entrypoint.d/30-config.sh
RUN chmod +x /docker-entrypoint.d/30-config.sh
