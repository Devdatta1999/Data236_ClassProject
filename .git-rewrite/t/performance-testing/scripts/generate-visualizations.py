#!/usr/bin/env python3
"""
Performance Test Visualization Script
Generates graphs comparing Base, Caching, and Kafka performance scenarios
"""

import os
import sys
import json
import csv
import glob
from pathlib import Path
from datetime import datetime
import argparse

try:
    import pandas as pd
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    import seaborn as sns
    import numpy as np
except ImportError as e:
    print(f"Error: Required library not installed: {e}")
    print("Please install required packages:")
    print("  pip install pandas matplotlib seaborn numpy")
    sys.exit(1)

# Set style
sns.set_style("whitegrid")
plt.rcParams['figure.figsize'] = (14, 8)
plt.rcParams['font.size'] = 10

# Colors for scenarios
SCENARIO_COLORS = {
    'base': '#e74c3c',      # Red
    'caching': '#3498db',   # Blue
    'kafka': '#2ecc71'      # Green
}

SCENARIO_LABELS = {
    'base': 'Base (No Caching)',
    'caching': 'Caching (Redis)',
    'kafka': 'Kafka (Async)'
}


def parse_jmeter_jtl(jtl_file):
    """Parse JMeter JTL file and return DataFrame"""
    try:
        df = pd.read_csv(jtl_file, sep=',')
        
        # Convert timestamp to datetime
        if 'timeStamp' in df.columns:
            df['datetime'] = pd.to_datetime(df['timeStamp'], unit='ms')
        
        # Calculate response time in seconds
        if 'elapsed' in df.columns:
            df['response_time'] = df['elapsed'] / 1000.0
        
        return df
    except Exception as e:
        print(f"Error parsing {jtl_file}: {e}")
        return None


def load_test_results(results_dir):
    """Load all test results from results directory"""
    results = {}
    
    for scenario in ['base', 'caching', 'kafka']:
        # Find most recent JTL file for this scenario
        pattern = os.path.join(results_dir, f"{scenario}-*.jtl")
        files = glob.glob(pattern)
        
        if not files:
            print(f"Warning: No results found for {scenario}")
            continue
        
        # Get most recent file
        latest_file = max(files, key=os.path.getctime)
        df = parse_jmeter_jtl(latest_file)
        
        if df is not None:
            results[scenario] = {
                'data': df,
                'file': latest_file
            }
    
    return results


def calculate_metrics(df):
    """Calculate performance metrics from DataFrame"""
    if df is None or df.empty:
        return None
    
    metrics = {
        'total_requests': len(df),
        'successful_requests': len(df[df['success'] == True]) if 'success' in df.columns else 0,
        'failed_requests': len(df[df['success'] == False]) if 'success' in df.columns else 0,
        'error_rate': 0,
        'avg_response_time': 0,
        'median_response_time': 0,
        'p90_response_time': 0,
        'p95_response_time': 0,
        'p99_response_time': 0,
        'min_response_time': 0,
        'max_response_time': 0,
        'throughput': 0
    }
    
    if 'response_time' in df.columns:
        response_times = df['response_time']
        metrics['avg_response_time'] = response_times.mean()
        metrics['median_response_time'] = response_times.median()
        metrics['p90_response_time'] = response_times.quantile(0.90)
        metrics['p95_response_time'] = response_times.quantile(0.95)
        metrics['p99_response_time'] = response_times.quantile(0.99)
        metrics['min_response_time'] = response_times.min()
        metrics['max_response_time'] = response_times.max()
    
    if metrics['total_requests'] > 0:
        metrics['error_rate'] = (metrics['failed_requests'] / metrics['total_requests']) * 100
    
    # Calculate throughput (requests per second)
    if 'datetime' in df.columns and len(df) > 1:
        time_span = (df['datetime'].max() - df['datetime'].min()).total_seconds()
        if time_span > 0:
            metrics['throughput'] = metrics['total_requests'] / time_span
    
    return metrics


def plot_response_time_comparison(results, output_dir):
    """Create response time comparison graph"""
    fig, ax = plt.subplots(figsize=(14, 8))
    
    scenarios = []
    avg_times = []
    p90_times = []
    p95_times = []
    p99_times = []
    
    for scenario in ['base', 'caching', 'kafka']:
        if scenario not in results:
            continue
        
        metrics = calculate_metrics(results[scenario]['data'])
        if metrics:
            scenarios.append(SCENARIO_LABELS[scenario])
            avg_times.append(metrics['avg_response_time'])
            p90_times.append(metrics['p90_response_time'])
            p95_times.append(metrics['p95_response_time'])
            p99_times.append(metrics['p99_response_time'])
    
    x = np.arange(len(scenarios))
    width = 0.2
    
    ax.bar(x - 1.5*width, avg_times, width, label='Average', color='#3498db', alpha=0.8)
    ax.bar(x - 0.5*width, p90_times, width, label='90th Percentile', color='#2ecc71', alpha=0.8)
    ax.bar(x + 0.5*width, p95_times, width, label='95th Percentile', color='#f39c12', alpha=0.8)
    ax.bar(x + 1.5*width, p99_times, width, label='99th Percentile', color='#e74c3c', alpha=0.8)
    
    ax.set_xlabel('Test Scenario', fontsize=12, fontweight='bold')
    ax.set_ylabel('Response Time (seconds)', fontsize=12, fontweight='bold')
    ax.set_title('Response Time Comparison: Base vs Caching vs Kafka', fontsize=14, fontweight='bold')
    ax.set_xticks(x)
    ax.set_xticklabels(scenarios)
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    output_file = os.path.join(output_dir, 'response-time-comparison.png')
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Saved: {output_file}")
    plt.close()


def plot_response_time_over_time(results, output_dir):
    """Create response time over time graph"""
    fig, ax = plt.subplots(figsize=(16, 8))
    
    for scenario in ['base', 'caching', 'kafka']:
        if scenario not in results:
            continue
        
        df = results[scenario]['data']
        if 'datetime' in df.columns and 'response_time' in df.columns:
            # Sample data for smoother visualization (every 10th point)
            df_sampled = df[::max(1, len(df)//1000)]
            ax.plot(df_sampled['datetime'], df_sampled['response_time'], 
                   label=SCENARIO_LABELS[scenario], 
                   color=SCENARIO_COLORS[scenario],
                   alpha=0.7,
                   linewidth=1.5)
    
    ax.set_xlabel('Time', fontsize=12, fontweight='bold')
    ax.set_ylabel('Response Time (seconds)', fontsize=12, fontweight='bold')
    ax.set_title('Response Time Over Time', fontsize=14, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    # Format x-axis
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
    plt.xticks(rotation=45)
    
    plt.tight_layout()
    output_file = os.path.join(output_dir, 'response-time-over-time.png')
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Saved: {output_file}")
    plt.close()


def plot_throughput_comparison(results, output_dir):
    """Create throughput comparison graph"""
    fig, ax = plt.subplots(figsize=(12, 8))
    
    scenarios = []
    throughputs = []
    
    for scenario in ['base', 'caching', 'kafka']:
        if scenario not in results:
            continue
        
        metrics = calculate_metrics(results[scenario]['data'])
        if metrics:
            scenarios.append(SCENARIO_LABELS[scenario])
            throughputs.append(metrics['throughput'])
    
    colors = [SCENARIO_COLORS.get(s.lower().split()[0], '#95a5a6') for s in scenarios]
    bars = ax.bar(scenarios, throughputs, color=colors, alpha=0.8, edgecolor='black', linewidth=1.5)
    
    # Add value labels on bars
    for bar in bars:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height,
               f'{height:.2f} req/s',
               ha='center', va='bottom', fontweight='bold')
    
    ax.set_xlabel('Test Scenario', fontsize=12, fontweight='bold')
    ax.set_ylabel('Throughput (requests/second)', fontsize=12, fontweight='bold')
    ax.set_title('Throughput Comparison: Base vs Caching vs Kafka', fontsize=14, fontweight='bold')
    ax.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    output_file = os.path.join(output_dir, 'throughput-comparison.png')
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Saved: {output_file}")
    plt.close()


def plot_error_rate_comparison(results, output_dir):
    """Create error rate comparison graph"""
    fig, ax = plt.subplots(figsize=(12, 8))
    
    scenarios = []
    error_rates = []
    
    for scenario in ['base', 'caching', 'kafka']:
        if scenario not in results:
            continue
        
        metrics = calculate_metrics(results[scenario]['data'])
        if metrics:
            scenarios.append(SCENARIO_LABELS[scenario])
            error_rates.append(metrics['error_rate'])
    
    colors = [SCENARIO_COLORS.get(s.lower().split()[0], '#95a5a6') for s in scenarios]
    bars = ax.bar(scenarios, error_rates, color=colors, alpha=0.8, edgecolor='black', linewidth=1.5)
    
    # Add value labels on bars
    for bar in bars:
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height,
               f'{height:.2f}%',
               ha='center', va='bottom', fontweight='bold')
    
    ax.set_xlabel('Test Scenario', fontsize=12, fontweight='bold')
    ax.set_ylabel('Error Rate (%)', fontsize=12, fontweight='bold')
    ax.set_title('Error Rate Comparison: Base vs Caching vs Kafka', fontsize=14, fontweight='bold')
    ax.set_ylim(0, max(error_rates) * 1.2 if error_rates else 10)
    ax.grid(True, alpha=0.3, axis='y')
    
    plt.tight_layout()
    output_file = os.path.join(output_dir, 'error-rate-comparison.png')
    plt.savefig(output_file, dpi=300, bbox_inches='tight')
    print(f"Saved: {output_file}")
    plt.close()


def plot_response_time_distribution(results, output_dir):
    """Create response time distribution box plot"""
    fig, ax = plt.subplots(figsize=(12, 8))
    
    data_to_plot = []
    labels = []
    
    for scenario in ['base', 'caching', 'kafka']:
        if scenario not in results:
            continue
        
        df = results[scenario]['data']
        if 'response_time' in df.columns:
            data_to_plot.append(df['response_time'].values)
            labels.append(SCENARIO_LABELS[scenario])
    
    if data_to_plot:
        bp = ax.boxplot(data_to_plot, labels=labels, patch_artist=True, 
                        showmeans=True, meanline=True)
        
        # Color the boxes
        for patch, scenario in zip(bp['boxes'], labels):
            scenario_key = scenario.lower().split()[0]
            patch.set_facecolor(SCENARIO_COLORS.get(scenario_key, '#95a5a6'))
            patch.set_alpha(0.7)
        
        ax.set_xlabel('Test Scenario', fontsize=12, fontweight='bold')
        ax.set_ylabel('Response Time (seconds)', fontsize=12, fontweight='bold')
        ax.set_title('Response Time Distribution (Box Plot)', fontsize=14, fontweight='bold')
        ax.grid(True, alpha=0.3, axis='y')
        
        plt.tight_layout()
        output_file = os.path.join(output_dir, 'response-time-distribution.png')
        plt.savefig(output_file, dpi=300, bbox_inches='tight')
        print(f"Saved: {output_file}")
        plt.close()


def generate_summary_report(results, output_dir):
    """Generate summary report with metrics"""
    report = []
    report.append("=" * 80)
    report.append("PERFORMANCE TEST SUMMARY REPORT")
    report.append("=" * 80)
    report.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report.append("")
    
    for scenario in ['base', 'caching', 'kafka']:
        if scenario not in results:
            continue
        
        metrics = calculate_metrics(results[scenario]['data'])
        if metrics:
            report.append(f"{SCENARIO_LABELS[scenario].upper()}")
            report.append("-" * 80)
            report.append(f"Total Requests:        {metrics['total_requests']:,}")
            report.append(f"Successful Requests:  {metrics['successful_requests']:,}")
            report.append(f"Failed Requests:      {metrics['failed_requests']:,}")
            report.append(f"Error Rate:           {metrics['error_rate']:.2f}%")
            report.append(f"Average Response Time: {metrics['avg_response_time']:.3f}s")
            report.append(f"Median Response Time: {metrics['median_response_time']:.3f}s")
            report.append(f"90th Percentile:      {metrics['p90_response_time']:.3f}s")
            report.append(f"95th Percentile:      {metrics['p95_response_time']:.3f}s")
            report.append(f"99th Percentile:      {metrics['p99_response_time']:.3f}s")
            report.append(f"Min Response Time:    {metrics['min_response_time']:.3f}s")
            report.append(f"Max Response Time:    {metrics['max_response_time']:.3f}s")
            report.append(f"Throughput:           {metrics['throughput']:.2f} req/s")
            report.append("")
    
    report_text = "\n".join(report)
    
    # Save to file
    report_file = os.path.join(output_dir, 'summary-report.txt')
    with open(report_file, 'w') as f:
        f.write(report_text)
    
    print(f"Saved: {report_file}")
    print("\n" + report_text)


def main():
    parser = argparse.ArgumentParser(description='Generate performance test visualizations')
    parser.add_argument('--results-dir', type=str, 
                       default=os.path.join(os.path.dirname(__file__), '..', 'results'),
                       help='Directory containing test results')
    parser.add_argument('--output-dir', type=str,
                       default=os.path.join(os.path.dirname(__file__), '..', 'visualizations'),
                       help='Output directory for visualizations')
    
    args = parser.parse_args()
    
    # Create output directory
    os.makedirs(args.output_dir, exist_ok=True)
    
    # Load results
    print("Loading test results...")
    results = load_test_results(args.results_dir)
    
    if not results:
        print("Error: No test results found!")
        print(f"Please run tests first. Expected results in: {args.results_dir}")
        sys.exit(1)
    
    print(f"Found results for {len(results)} scenario(s)")
    print()
    
    # Generate visualizations
    print("Generating visualizations...")
    plot_response_time_comparison(results, args.output_dir)
    plot_response_time_over_time(results, args.output_dir)
    plot_throughput_comparison(results, args.output_dir)
    plot_error_rate_comparison(results, args.output_dir)
    plot_response_time_distribution(results, args.output_dir)
    
    # Generate summary report
    print("\nGenerating summary report...")
    generate_summary_report(results, args.output_dir)
    
    print(f"\nAll visualizations saved to: {args.output_dir}")


if __name__ == '__main__':
    main()



