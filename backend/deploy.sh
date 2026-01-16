#!/bin/bash

# PreBot Backend Deployment Script for VPS
# Usage: ./deploy.sh

set -e

echo "🚀 Starting PreBot Backend Deployment..."

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 is not installed. Installing..."
    npm install -g pm2
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Run database migrations/initialization
echo "🗄️ Initializing database..."
npm run init:modules || echo "⚠️ Database initialization skipped (may already exist)"

# Create logs directory
mkdir -p logs

# Stop existing PM2 process if running
echo "🛑 Stopping existing process..."
pm2 stop prebot-backend 2>/dev/null || echo "No existing process to stop"

# Start application with PM2
echo "▶️ Starting application..."
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

echo "✅ Deployment complete!"
echo ""
echo "📊 Application Status:"
pm2 status

echo ""
echo "📝 Useful commands:"
echo "  - View logs: pm2 logs prebot-backend"
echo "  - Restart: pm2 restart prebot-backend"
echo "  - Stop: pm2 stop prebot-backend"
echo "  - Monitor: pm2 monit"






