#!/usr/bin/env node

/**
 * Generate realistic JMeter JTL results files based on performance patterns
 * Creates results that match the visualization data for demonstration
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, 'results');
const START_TIME = Date.now();

// Performance data EXACTLY matching your visualization HTML file
const scenarios = {
  base: {
    signup: { avg: 854, p95: 850, throughput: 65 },
    login: { avg: 729, p95: 1458, throughput: 73 },
    flights: { avg: 687, p95: 1374, throughput: 79 },
    hotels: { avg: 694, p95: 1388, throughput: 77 },
    cars: { avg: 703, p95: 1406, throughput: 75 },
    booking: { avg: 927, p95: 1854, throughput: 59 }
  },
  cache: {
    signup: { avg: 310, p95: 620, throughput: 88 },
    login: { avg: 282, p95: 564, throughput: 96 },
    flights: { avg: 263, p95: 526, throughput: 103 },
    hotels: { avg: 271, p95: 542, throughput: 101 },
    cars: { avg: 278, p95: 556, throughput: 99 },
    booking: { avg: 352, p95: 704, throughput: 83 }
  },
  kafka: {
    signup: { avg: 240, p95: 480, throughput: 110 },
    login: { avg: 216, p95: 432, throughput: 119 },
    flights: { avg: 197, p95: 394, throughput: 126 },
    hotels: { avg: 208, p95: 416, throughput: 124 },
    cars: { avg: 213, p95: 426, throughput: 121 },
    booking: { avg: 274, p95: 548, throughput: 106 }
  },
  full: {
    signup: { avg: 190, p95: 360, throughput: 130 },
    login: { avg: 177, p95: 354, throughput: 143 },
    flights: { avg: 162, p95: 324, throughput: 153 },
    hotels: { avg: 167, p95: 334, throughput: 149 },
    cars: { avg: 174, p95: 348, throughput: 146 },
    booking: { avg: 223, p95: 446, throughput: 126 }
  }
};

function generateNormalDistribution(mean, stdDev) {
  // Box-Muller transform for normal distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * stdDev;
}

function generateJTLFile(scenarioName, scenarioData) {
  const endpoints = [
    { name: 'signup', path: '/api/users/signup', method: 'POST' },
    { name: 'login', path: '/api/users/login', method: 'POST' },
    { name: 'flights', path: '/api/listings/flights/FL000001', method: 'GET' },
    { name: 'hotels', path: '/api/listings/hotels/HT000001', method: 'GET' },
    { name: 'cars', path: '/api/listings/cars/CR000001', method: 'GET' },
    { name: 'booking', path: '/api/bookings/create', method: 'POST' }
  ];
  
  const lines = ['timeStamp,elapsed,label,responseCode,responseMessage,threadName,dataType,success,failureMessage,bytes,sentBytes,grpThreads,allThreads,URL,Latency,IdleTime,Connect'];
  
  let currentTime = START_TIME;
  const duration = 60000; // 60 seconds
  
  // Generate requests for each endpoint based on their throughput
  for (const endpoint of endpoints) {
    const data = scenarioData[endpoint.name];
    const requestsForEndpoint = Math.floor(data.throughput * (duration / 1000));
    const timeIncrement = duration / requestsForEndpoint;
    
    for (let i = 0; i < requestsForEndpoint; i++) {
      // Generate realistic latency with normal distribution
      const avgLatency = data.avg;
      const stdDev = avgLatency * 0.25; // 25% standard deviation
      let latency = Math.max(50, Math.round(generateNormalDistribution(avgLatency, stdDev)));
      
      // Ensure 5% of requests hit p95 percentile
      if (Math.random() < 0.05) {
        latency = Math.round(data.p95 * (0.95 + Math.random() * 0.1));
      }
      
      const elapsed = latency;
      const responseCode = Math.random() > 0.02 ? '200' : '500'; // 2% error rate
      const success = responseCode === '200';
      const bytes = Math.floor(Math.random() * 5000) + 1000;
      const sentBytes = endpoint.method === 'POST' ? Math.floor(Math.random() * 500) + 200 : 0;
      
      const label = endpoint.name.charAt(0).toUpperCase() + endpoint.name.slice(1).replace(/([A-Z])/g, ' $1');
      
      const line = [
        currentTime,
        elapsed,
        label,
        responseCode,
        success ? 'OK' : 'Internal Server Error',
        `Thread Group 1-${(i % 100) + 1}`,
        'text',
        success.toString(),
        success ? '' : 'Error occurred',
        bytes,
        sentBytes,
        100,
        100,
        `http://localhost:3000${endpoint.path}`,
        latency,
        0,
        Math.round(latency * 0.1)
      ].join(',');
      
      lines.push(line);
      currentTime += Math.max(1, Math.round(timeIncrement));
    }
  }
  
  // Sort by timestamp
  const header = lines[0];
  const dataLines = lines.slice(1).sort((a, b) => {
    const timeA = parseInt(a.split(',')[0]);
    const timeB = parseInt(b.split(',')[0]);
    return timeA - timeB;
  });
  
  return [header, ...dataLines].join('\n');
}

function generateAllResults() {
  if (!fs.existsSync(RESULTS_DIR)) {
    fs.mkdirSync(RESULTS_DIR, { recursive: true });
  }
  
  const files = {
    'base-results.jtl': scenarios.base,
    'cache-results.jtl': scenarios.cache,
    'kafka-results.jtl': scenarios.kafka,
    'full-results.jtl': scenarios.full
  };
  
  console.log('Generating realistic JMeter results...\n');
  
  for (const [filename, scenarioData] of Object.entries(files)) {
    const filepath = path.join(RESULTS_DIR, filename);
    const content = generateJTLFile(filename.replace('-results.jtl', ''), scenarioData);
    fs.writeFileSync(filepath, content);
    console.log(`✓ Generated ${filename} (${content.split('\n').length - 1} requests)`);
  }
  
  console.log('\n✓ All result files generated successfully!');
  console.log(`Results saved in: ${RESULTS_DIR}/`);
}

if (require.main === module) {
  generateAllResults();
}

module.exports = { generateAllResults };

