#!/bin/bash

# Performance Testing Setup Script
# Installs dependencies and prepares the testing environment

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PERF_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$PERF_DIR/.." && pwd)"

echo "=========================================="
echo "Performance Testing Setup"
echo "=========================================="
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required but not installed"
    exit 1
fi

echo "✓ Python 3 found: $(python3 --version)"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed"
    exit 1
fi

echo "✓ Node.js found: $(node --version)"

# Install Python dependencies
echo ""
echo "Installing Python dependencies..."
if pip3 install -q -r "$PERF_DIR/requirements.txt"; then
    echo "✓ Python dependencies installed"
else
    echo "Warning: Failed to install some Python dependencies"
    echo "You may need to install manually: pip3 install pandas matplotlib seaborn numpy"
fi

# Generate test data
echo ""
echo "Generating test data..."
if node "$PERF_DIR/test-data/generate-test-data.js"; then
    echo "✓ Test data generated"
else
    echo "Error: Failed to generate test data"
    exit 1
fi

# Generate JMeter test plans
echo ""
echo "Generating JMeter test plans..."
if python3 "$PERF_DIR/jmeter-plans/generate-simple-jmeter-plans.py"; then
    echo "✓ JMeter test plans generated"
else
    echo "Error: Failed to generate JMeter test plans"
    exit 1
fi

# Check JMeter
echo ""
if [ -z "$JMETER_HOME" ]; then
    echo "⚠ Warning: JMETER_HOME not set"
    echo "  Please set JMETER_HOME environment variable:"
    echo "  export JMETER_HOME=/path/to/apache-jmeter-5.6.2"
    echo ""
    echo "  Or install JMeter:"
    echo "  macOS: brew install jmeter"
    echo "  Linux: Download from https://jmeter.apache.org/download_jmeter.cgi"
else
    if [ -d "$JMETER_HOME" ]; then
        echo "✓ JMeter found at: $JMETER_HOME"
    else
        echo "⚠ Warning: JMETER_HOME directory does not exist: $JMETER_HOME"
    fi
fi

# Create directories
echo ""
echo "Creating directories..."
mkdir -p "$PERF_DIR/results"
mkdir -p "$PERF_DIR/visualizations"
echo "✓ Directories created"

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Ensure services are running:"
echo "   - API Gateway: http://localhost:3000"
echo "   - Kafka Proxy: http://localhost:3007"
echo ""
echo "2. Run performance tests:"
echo "   cd $PERF_DIR/scripts"
echo "   ./run-performance-tests.sh"
echo ""
echo "3. Generate visualizations:"
echo "   python3 $PERF_DIR/scripts/generate-visualizations.py"
echo ""



