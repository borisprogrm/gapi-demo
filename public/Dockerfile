# Используем базовый образ Nginx
FROM nginx:alpine

# Копируем статические файлы в соответствующую директорию Nginx
COPY *.html /usr/share/nginx/html/

# Копируем конфигурационный файл Nginx
COPY nginx.conf /etc/nginx/nginx.conf
