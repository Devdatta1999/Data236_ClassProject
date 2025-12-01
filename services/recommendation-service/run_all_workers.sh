#!/bin/bash

# Script to run all Deals Agent workers in the background

echo "Starting all Deals Agent workers..."

# Start MongoDB Reader (replaces CSV Feed Producer)
python3 -m deals_agent.mongo_reader &
MONGO_PID=$!
echo "MongoDB Reader started (PID: $MONGO_PID)"

# Start Normalizer
python3 -m deals_agent.normalizer &
NORM_PID=$!
echo "Normalizer started (PID: $NORM_PID)"

# Start Deal Detector
python3 -m deals_agent.deal_detector &
DETECT_PID=$!
echo "Deal Detector started (PID: $DETECT_PID)"

# Start Offer Tagger
python3 -m deals_agent.offer_tagger &
TAG_PID=$!
echo "Offer Tagger started (PID: $TAG_PID)"

# Start Event Emitter
python3 -m deals_agent.event_emitter &
EMIT_PID=$!
echo "Event Emitter started (PID: $EMIT_PID)"

# Start Bundle Selection Worker (simulated price drops)
python3 -m deals_agent.bundle_selection_worker &
SELECTION_PID=$!
echo "Bundle Selection Worker started (PID: $SELECTION_PID)"

# Start Watch Evaluator
python3 watch_manager.py &
WATCH_PID=$!
echo "Watch Evaluator started (PID: $WATCH_PID)"

echo ""
echo "All workers started. PIDs:"
echo "  MongoDB Reader: $MONGO_PID"
echo "  Normalizer: $NORM_PID"
echo "  Deal Detector: $DETECT_PID"
echo "  Offer Tagger: $TAG_PID"
echo "  Event Emitter: $EMIT_PID"
echo "  Bundle Selection Worker: $SELECTION_PID"
echo "  Watch Evaluator: $WATCH_PID"
echo ""
echo "To stop all workers, run:"
echo "  kill $MONGO_PID $NORM_PID $DETECT_PID $TAG_PID $EMIT_PID $SELECTION_PID $WATCH_PID"

# Wait for all background jobs
wait

