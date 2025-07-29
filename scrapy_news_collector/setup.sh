#!/bin/bash

echo "🔧 Setting up Scrapy News Collector..."

# Verifică dacă Python3 este instalat
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 is not installed. Please install Python3 first."
    exit 1
fi

# Creează virtual environment dacă nu există
if [ ! -d "venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activează virtual environment
echo "🔌 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip

# Instalează dependențele
echo "📚 Installing Python dependencies..."
pip install -r requirements.txt

# Verifică instalarea
echo "✅ Verifying installation..."
python -c "import scrapy; print(f'Scrapy version: {scrapy.__version__}')"
python -c "import openai; print('OpenAI client imported successfully')"
python -c "import feedparser; print('Feedparser imported successfully')"

echo "🎉 Setup completed successfully!"
echo ""
echo "To run the scraper:"
echo "1. Set your OpenAI API key in .env file or environment"
echo "2. Run: python run_scraper.py"