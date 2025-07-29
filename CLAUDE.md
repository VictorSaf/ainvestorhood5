# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AIInvestorHood5 is a web application that uses OpenAI's ChatGPT API to automatically search, analyze, and display financial market news. The app provides AI-powered buy/sell recommendations with confidence scores for stocks, forex, crypto, commodities, and indices.

## Architecture

- **Backend**: Node.js/Express server with SQLite database
- **Frontend**: React SPA with Instagram-like mobile-optimized UI  
- **AI Integration**: OpenAI GPT-4 for news search and analysis
- **Scheduling**: Node-cron for automated news collection every 5 minutes
- **Database**: SQLite with tables for settings and news articles

## Development Commands

```bash
# Install all dependencies
npm run install-all

# Start development (runs both server and client)
npm run dev

# Start server only
npm run server

# Start client only  
npm run client

# Build for production
npm run build

# Start production server
npm start
```

## Key Features

- **Automated News Collection**: Searches financial news every 5 minutes using AI
- **Duplicate Detection**: Content hashing prevents duplicate articles
- **AI Analysis**: Each article gets summary, instrument type, buy/sell recommendation, and confidence score (1-100)
- **3-Day Retention**: Old articles automatically cleaned up
- **Mobile-First UI**: Instagram-style cards optimized for mobile devices
- **API Key Management**: Secure storage of OpenAI API key

## Database Schema

- `settings`: Stores OpenAI API key and other configuration
- `news_articles`: Stores analyzed news with title, summary, recommendation, confidence score, instrument details, and creation timestamp

## File Structure

- `server/`: Express backend with AI service, database, and scheduler
- `client/`: React frontend with components and styling  
- `server/database.js`: SQLite database operations
- `server/aiService.js`: OpenAI integration and web scraping
- `server/newsScheduler.js`: Cron jobs for automated news collection

## Setup Requirements

1. OpenAI API key (prompted on first run)
2. Node.js and npm installed
3. Run `npm run install-all` to install dependencies