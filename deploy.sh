#!/bin/bash

# Deployment script for Screening Backend
# Usage: ./deploy.sh

set -e

echo "🚀 Starting deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install

# Build TypeScript
echo -e "${YELLOW}🔨 Building TypeScript...${NC}"
npm run build

# Check if build was successful
if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

# Run database migrations (if any)
echo -e "${YELLOW}🗄️  Running database migrations...${NC}"
# npm run migrate  # Uncomment if you have migrations

# Restart PM2 process
echo -e "${YELLOW}🔄 Restarting PM2 process...${NC}"
if pm2 list | grep -q "screening-backend"; then
    pm2 restart screening-backend
else
    pm2 start dist/server.js --name screening-backend
    pm2 save
fi

# Show status
echo -e "${GREEN}✅ Deployment complete!${NC}"
pm2 status screening-backend
pm2 logs screening-backend --lines 20


