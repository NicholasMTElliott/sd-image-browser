#!/bin/sh

if [ ! -f /etc/nginx/ssl/self-signed.key ]; then
    echo "Generating self-signed certificate"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout /etc/nginx/ssl/self-signed.key -out /etc/nginx/ssl/self-signed.crt -subj "/C=US/ST=YourState/L=YourCity/O=YourOrganization/OU=YourUnit/CN=192.168.1.11"
fi
echo "Launching"
exec /docker-entrypoint.sh nginx -g "daemon off;"
