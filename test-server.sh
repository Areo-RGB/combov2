#!/bin/bash

echo "🧪 Starting test server..."
echo ""
echo "Open your browser to:"
echo "  http://localhost:8080/test-nextjs.html"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start simple Python HTTP server
python3 -m http.server 8080
