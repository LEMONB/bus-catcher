#!/bin/bash

set -e

echo "Pulling image updates"
docker compose pull

echo "Starting containers"
docker compose up -d

echo "Waiting for container to start"
sleep 5

echo "Health check"
if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health | grep -q "200"; then
  echo "OK - buscatcher is healthy"
else
  echo "WARNING - health check failed, container may still be starting"
  docker compose logs --tail=20
fi
