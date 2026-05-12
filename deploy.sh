#!/bin/bash

set -e

echo "Pulling image updates"
docker compose -f docker-compose.prod.yml pull

echo "Starting containers"
docker compose -f docker-compose.prod.yml up -d

echo "Waiting for container to start"
sleep 5

echo "Health check"
if docker exec buscatcher-nginx curl -s -o /dev/null -w "%{http_code}" http://localhost:80/health | grep -q "200"; then
  echo "OK - buscatcher is healthy"
else
  echo "WARNING - health check failed, container may still be starting"
  docker compose -f docker-compose.prod.yml logs --tail=20
fi
