#!/bin/bash

# Push script for Aerive Docker images
# Usage: ./push-images.sh [registry] [version]

set -e

REGISTRY=${1:-"aerive"}
VERSION=${2:-"latest"}

if [ "$REGISTRY" == "aerive" ]; then
  echo "Error: Please provide a registry (e.g., docker.io/username, gcr.io/project-id)"
  echo "Usage: ./push-images.sh <registry> [version]"
  exit 1
fi

echo "Pushing Aerive Docker images to $REGISTRY..."
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
)

for service in "${SERVICES[@]}"; do
  echo "Pushing $service..."
  docker push $REGISTRY/aerive/$service:$VERSION
  echo "✓ Pushed: $REGISTRY/aerive/$service:$VERSION"
  echo ""
done

echo "All images pushed successfully!"
echo ""
echo "Next steps:"
echo "1. Update Kubernetes manifests with registry: $REGISTRY"
echo "2. Run: kubectl apply -f infrastructure/kubernetes/"

