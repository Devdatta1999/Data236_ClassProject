#!/bin/bash

# Helper script to set up port-forwards for testing
# Run this in a separate terminal before running test-k8s.sh

set -e

NAMESPACE="${NAMESPACE:-aerive}"

echo "Setting up port-forwards for Aerive services..."
echo "Press Ctrl+C to stop all port-forwards"
echo ""

# Function to cleanup on exit
cleanup() {
  echo ""
  echo "Stopping port-forwards..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

# Start port-forwards in background
echo "Starting API Gateway port-forward (8080:80)..."
kubectl port-forward -n ${NAMESPACE} service/aerive-api-gateway 8080:80 &
PF1_PID=$!

echo "Starting Kafka port-forward (9092:9092)..."
kubectl port-forward -n ${NAMESPACE} service/aerive-kafka-service 9092:9092 &
PF2_PID=$!

echo ""
echo "✅ Port-forwards are running:"
echo "   API Gateway: http://localhost:8080"
echo "   Kafka: localhost:9092"
echo ""
echo "Press Ctrl+C to stop all port-forwards"

# Wait for all background jobs
wait

