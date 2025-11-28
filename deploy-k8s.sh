#!/bin/bash

# Kubernetes deployment script
# Usage: ./deploy-k8s.sh [registry]

set -e

REGISTRY=${1:-""}

if [ -z "$REGISTRY" ]; then
  echo "Usage: ./deploy-k8s.sh <registry>"
  echo "Example: ./deploy-k8s.sh docker.io/username"
  exit 1
fi

echo "Deploying Aerive to Kubernetes..."
echo "Registry: $REGISTRY"
echo ""

# Update image names in YAML files
echo "Updating image names in Kubernetes manifests..."
cd infrastructure/kubernetes

if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' "s|image: aerive/|image: $REGISTRY/aerive/|g" *.yaml
else
  # Linux
  sed -i "s|image: aerive/|image: $REGISTRY/aerive/|g" *.yaml
fi

cd ../..

echo "✓ Updated image names"
echo ""

# Create namespace
echo "Creating namespace..."
kubectl apply -f infrastructure/kubernetes/namespace.yaml
echo "✓ Namespace created"
echo ""

# Create ConfigMap and Secrets
echo "Creating ConfigMap and Secrets..."
echo "⚠️  Make sure to update configmap.yaml and secrets.yaml with your actual values!"
read -p "Press enter to continue or Ctrl+C to cancel..."

kubectl apply -f infrastructure/kubernetes/configmap.yaml
kubectl apply -f infrastructure/kubernetes/secrets.yaml
echo "✓ ConfigMap and Secrets created"
echo ""

# Deploy services
echo "Deploying services..."
kubectl apply -f infrastructure/kubernetes/user-service.yaml
kubectl apply -f infrastructure/kubernetes/listing-service.yaml
kubectl apply -f infrastructure/kubernetes/booking-service.yaml
kubectl apply -f infrastructure/kubernetes/billing-service.yaml
kubectl apply -f infrastructure/kubernetes/provider-service.yaml
kubectl apply -f infrastructure/kubernetes/admin-service.yaml
kubectl apply -f infrastructure/kubernetes/api-gateway.yaml
echo "✓ All services deployed"
echo ""

# Wait for deployments
echo "Waiting for deployments to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/aerive-user-service -n aerive
kubectl wait --for=condition=available --timeout=300s deployment/aerive-listing-service -n aerive
kubectl wait --for=condition=available --timeout=300s deployment/aerive-booking-service -n aerive
kubectl wait --for=condition=available --timeout=300s deployment/aerive-billing-service -n aerive
kubectl wait --for=condition=available --timeout=300s deployment/aerive-provider-service -n aerive
kubectl wait --for=condition=available --timeout=300s deployment/aerive-admin-service -n aerive
kubectl wait --for=condition=available --timeout=300s deployment/aerive-api-gateway -n aerive
echo "✓ All deployments ready"
echo ""

# Show status
echo "Deployment Status:"
kubectl get pods -n aerive
echo ""
kubectl get services -n aerive
echo ""

echo "Deployment complete!"
echo ""
echo "To access the API Gateway:"
echo "  kubectl port-forward service/aerive-api-gateway 3000:80 -n aerive"
echo ""
echo "To view logs:"
echo "  kubectl logs -f deployment/aerive-api-gateway -n aerive"

