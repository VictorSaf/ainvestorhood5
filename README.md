# AIInvestorHood5

An AI-powered financial news aggregator and analyzer that provides real-time buy/sell recommendations with confidence scores.

## 🚀 Features

- **Automated News Collection**: AI searches for financial news every 5 minutes
- **Smart Analysis**: Each article gets a summary, recommendation (BUY/SELL/HOLD), and confidence score (1-100)
- **Mobile-First Design**: Instagram-like interface optimized for mobile devices
- **Multi-Market Coverage**: Stocks, Forex, Crypto, Commodities, and Indices
- **Duplicate Prevention**: Smart content hashing prevents duplicate articles
- **Real-Time Updates**: Fresh content delivered every few minutes

## 🛠️ Tech Stack

- **Frontend**: React, CSS3, Lucide React Icons
- **Backend**: Node.js, Express
- **Database**: SQLite
- **AI**: OpenAI GPT-4 API
- **Scheduling**: Node-cron
- **Web Scraping**: Axios, Cheerio

## 🏃‍♂️ Quick Start

1. **Install dependencies**:
   ```bash
   npm run install-all
   ```

2. **Start development server**:
   ```bash
   npm run dev
   ```

3. **Open your browser**: Navigate to `http://localhost:3000`

4. **Enter API Key**: On first run, you'll be prompted to enter your OpenAI API key

## 📱 Mobile Experience

The app is designed mobile-first with:
- Instagram-style card layout
- Touch-friendly interactions
- Responsive design for all screen sizes
- Smooth scrolling and animations

## 🔑 API Key Setup

You'll need an OpenAI API key to use this application:

1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Enter it when prompted on first app launch

Your API key is stored securely in the local database and never shared.

## 📊 How It Works

1. **News Collection**: AI searches multiple financial sources every 5 minutes
2. **Content Analysis**: Each article is analyzed for trading insights
3. **Recommendation Generation**: AI provides BUY/SELL/HOLD recommendations
4. **Confidence Scoring**: Each recommendation gets a 1-100 confidence score
5. **Duplicate Detection**: Content hashing prevents showing the same news twice

## 🎯 Trading Insights

Each news card displays:
- **Instrument Type**: Stocks, Forex, Crypto, Commodities, or Indices  
- **Summary**: AI-generated summary in simple language
- **Recommendation**: BUY (green), SELL (red), or HOLD (yellow)
- **Confidence Score**: Visual bar showing AI's confidence (1-100%)
- **Source Link**: Direct link to original article

## 📝 License

MIT License - see LICENSE file for details

## ⚠️ Disclaimer

This application provides AI-generated analysis for educational purposes only. Not financial advice. Always do your own research before making investment decisions.