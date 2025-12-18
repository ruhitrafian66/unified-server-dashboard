#!/bin/bash

echo "🚀 Starting Unified Server Dashboard - Development Environment"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm run install:all
fi

# Build frontend if dist doesn't exist
if [ ! -d "frontend/dist" ]; then
    echo "🏗️  Building frontend..."
    cd frontend && npm run build && cd ..
fi

echo "🎯 Starting development server with mock data..."
echo ""
echo "📱 Dashboard will be available at: http://localhost:3001"
echo "🔧 API endpoints available at: http://localhost:3001/api"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the development server
npm run dev:mock