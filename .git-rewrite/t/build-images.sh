#!/bin/bash

# Build script for Aerive Docker images
# Usage: ./build-images.sh [registry] [version]

set -e

REGISTRY=${1:-"aerive"}
VERSION=${2:-"latest"}

echo "Building Aerive Docker images..."
echo "Registry: $REGISTRY"
echo "Version: $VERSION"
echo ""

SERVICES=(
  "user-service"
  "listing-service"
  "booking-service"
  "billing-service"
  "provider-service"
  "admin-service"
  "api-gateway"
  "kafka-proxy"
)

for service in "${SERVICES[@]}"; do
  echo "Building $service..."
  docker build -t aerive/$service:$VERSION -f services/$service/Dockerfile .
  
  if [ "$REGISTRY" != "aerive" ]; then
    docker tag aerive/$service:$VERSION $REGISTRY/aerive/$service:$VERSION
    echo "Tagged: $REGISTRY/aerive/$service:$VERSION"
  fi
  
  echo "✓ Built: aerive/$service:$VERSION"
  echo ""
done

echo "All images built successfully!"
echo ""
echo "To push images, run:"
echo "  ./push-images.sh $REGISTRY $VERSION"

