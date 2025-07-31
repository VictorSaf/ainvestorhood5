#!/bin/sh
# Automated news collection script for AIInvestorHood5

echo "🏦 Starting automated news collection service..."

# Copy collector to container
docker cp simple_news_collector.py ainvestorhood5:/app/

# Run collector every 5 minutes
while true; do
    echo "📰 $(date): Running news collection..."
    docker exec -w /app/scrapy_news_collector ainvestorhood5 sh -c "source venv/bin/activate && python3 /app/simple_news_collector.py" || echo "❌ Collection failed"
    
    echo "⏰ Waiting 5 minutes until next collection..."
    sleep 300  # 5 minutes
done