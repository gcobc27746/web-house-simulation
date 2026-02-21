#!/bin/sh
set -e
PORT="${PORT:-8080}"
sed "s/__PORT__/$PORT/" /etc/nginx/nginx.conf.template > /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
