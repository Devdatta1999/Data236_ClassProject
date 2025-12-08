#!/bin/bash

# Quick JMeter Performance Tests
# Runs all 4 scenarios with shorter duration for quick results

API_GATEWAY_URL=${API_GATEWAY_URL:-http://localhost:3000}
KAFKA_PROXY_URL=${KAFKA_PROXY_URL:-http://localhost:3007}
USERS=100
RAMP_UP=10
DURATION=60  # 60 seconds for quick results

RESULTS_DIR="results"
REPORTS_DIR="reports"

mkdir -p $RESULTS_DIR
mkdir -p $REPORTS_DIR

echo "=========================================="
echo "Running Quick JMeter Performance Tests"
echo "=========================================="
echo "API Gateway: $API_GATEWAY_URL"
echo "Kafka Proxy: $KAFKA_PROXY_URL"
echo "Users: $USERS"
echo "Ramp-up: $RAMP_UP seconds"
echo "Duration: $DURATION seconds per test"
echo "=========================================="
echo ""

# Test 1: Base (B)
echo "[1/4] Running Base (B) test..."
jmeter -n -t jmeter-plans/jmeter-base-performance.jmx \
  -JAPI_GATEWAY_URL=$API_GATEWAY_URL \
  -JUSERS=$USERS \
  -JRAMP_UP=$RAMP_UP \
  -JDURATION=$DURATION \
  -l $RESULTS_DIR/base-results.jtl \
  -e -o $REPORTS_DIR/base-report \
  -q jmeter.properties 2>&1 | grep -E "(summary|Error|Creating|summary =)" || echo "Base test completed"

echo ""

# Test 2: Base + Cache (B+S)
echo "[2/4] Running Base + Cache (B+S) test..."
jmeter -n -t jmeter-plans/jmeter-caching-performance.jmx \
  -JAPI_GATEWAY_URL=$API_GATEWAY_URL \
  -JUSERS=$USERS \
  -JRAMP_UP=$RAMP_UP \
  -JDURATION=$DURATION \
  -l $RESULTS_DIR/cache-results.jtl \
  -e -o $REPORTS_DIR/cache-report \
  -q jmeter.properties 2>&1 | grep -E "(summary|Error|Creating|summary =)" || echo "Cache test completed"

echo ""

# Test 3: Base + Cache + Kafka (B+S+K)
echo "[3/4] Running Base + Cache + Kafka (B+S+K) test..."
jmeter -n -t jmeter-plans/jmeter-kafka-performance.jmx \
  -JAPI_GATEWAY_URL=$API_GATEWAY_URL \
  -JKAFKA_PROXY_URL=$KAFKA_PROXY_URL \
  -JUSERS=$USERS \
  -JRAMP_UP=$RAMP_UP \
  -JDURATION=$DURATION \
  -l $RESULTS_DIR/kafka-results.jtl \
  -e -o $REPORTS_DIR/kafka-report \
  -q jmeter.properties 2>&1 | grep -E "(summary|Error|Creating|summary =)" || echo "Kafka test completed"

echo ""

# Test 4: Full Optimized (B+S+K+X) - Use kafka test as base
echo "[4/4] Running Full Optimized (B+S+K+X) test..."
jmeter -n -t jmeter-plans/jmeter-kafka-performance.jmx \
  -JAPI_GATEWAY_URL=$API_GATEWAY_URL \
  -JKAFKA_PROXY_URL=$KAFKA_PROXY_URL \
  -JUSERS=$USERS \
  -JRAMP_UP=$RAMP_UP \
  -JDURATION=$DURATION \
  -l $RESULTS_DIR/full-results.jtl \
  -e -o $REPORTS_DIR/full-report \
  -q jmeter.properties 2>&1 | grep -E "(summary|Error|Creating|summary =)" || echo "Full optimized test completed"

echo ""
echo "=========================================="
echo "All tests completed!"
echo "=========================================="
echo "Results saved in: $RESULTS_DIR/"
echo "Reports saved in: $REPORTS_DIR/"
echo ""
echo "To view results:"
echo "  - Base: open $REPORTS_DIR/base-report/index.html"
echo "  - Cache: open $REPORTS_DIR/cache-report/index.html"
echo "  - Kafka: open $REPORTS_DIR/kafka-report/index.html"
echo "  - Full: open $REPORTS_DIR/full-report/index.html"



