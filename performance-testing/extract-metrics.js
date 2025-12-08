#!/usr/bin/env node

/**
 * Extract metrics from JMeter JTL results files
 * Generates a summary JSON file with all metrics for visualization
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, 'results');
const OUTPUT_FILE = path.join(__dirname, 'metrics-summary.json');

function parseJTLFile(filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        console.error(`Error reading ${filePath}:`, err.message);
        resolve(null);
        return;
      }

      // Parse CSV format JTL
      const lines = data.trim().split('\n');
      if (lines.length < 2) {
        console.warn(`No data in ${filePath}`);
        resolve(null);
        return;
      }

      // Skip header
      const samples = lines.slice(1).map(line => {
        const cols = line.split(',');
        return {
          time: parseInt(cols[0]) || 0,
          elapsed: parseInt(cols[1]) || 0,
          label: cols[2] || '',
          responseCode: cols[3] || '',
          success: cols[7] === 'true',
          bytes: parseInt(cols[8]) || 0,
          latency: parseInt(cols[9]) || 0
        };
      }).filter(s => s.success);

      if (samples.length === 0) {
        resolve(null);
        return;
      }

      // Calculate metrics
      const latencies = samples.map(s => s.elapsed).sort((a, b) => a - b);
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const p95Index = Math.floor(latencies.length * 0.95);
      const p95Latency = latencies[p95Index] || latencies[latencies.length - 1];

      // Calculate throughput (requests per second)
      const totalTime = Math.max(...samples.map(s => s.time)) - Math.min(...samples.map(s => s.time));
      const throughput = totalTime > 0 ? (samples.length / (totalTime / 1000)) : 0;

      // Calculate error rate
      const totalSamples = lines.length - 1;
      const errorRate = ((totalSamples - samples.length) / totalSamples) * 100;

      resolve({
        avgLatency: Math.round(avgLatency),
        p95Latency: Math.round(p95Latency),
        throughput: Math.round(throughput * 100) / 100,
        errorRate: Math.round(errorRate * 100) / 100,
        totalRequests: samples.length,
        totalTime: totalTime / 1000
      });
    });
  });
}

async function extractAllMetrics() {
  const scenarios = [
    { name: 'base', file: 'base-results.jtl' },
    { name: 'cache', file: 'cache-results.jtl' },
    { name: 'kafka', file: 'kafka-results.jtl' },
    { name: 'full', file: 'full-results.jtl' }
  ];

  const metrics = {};

  for (const scenario of scenarios) {
    const filePath = path.join(RESULTS_DIR, scenario.file);
    console.log(`Extracting metrics from ${scenario.file}...`);
    const result = await parseJTLFile(filePath);
    if (result) {
      metrics[scenario.name] = result;
      console.log(`  ✓ ${scenario.name}: Avg=${result.avgLatency}ms, P95=${result.p95Latency}ms, Throughput=${result.throughput}req/s`);
    } else {
      console.log(`  ✗ ${scenario.name}: No valid data found`);
    }
  }

  // Write summary
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(metrics, null, 2));
  console.log(`\nMetrics summary saved to: ${OUTPUT_FILE}`);
  
  return metrics;
}

if (require.main === module) {
  extractAllMetrics().catch(console.error);
}

module.exports = { extractAllMetrics };

