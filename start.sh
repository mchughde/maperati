#!/bin/bash
cd "$(dirname "$0")"
# Kill any existing Flask instance so port 5001 is free
pkill -f "python3 app.py" 2>/dev/null
sleep 1
# Start Flask in background
FLASK_DEBUG=1 python3 app.py &
# Wait for Flask to be ready
sleep 2
