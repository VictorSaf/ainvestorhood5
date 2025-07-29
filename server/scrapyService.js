const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class ScrapyService {
  constructor() {
    this.scraperPath = path.join(__dirname, '..', 'scrapy_news_collector');
    this.pythonPath = path.join(this.scraperPath, 'venv', 'bin', 'python3');
    this.scriptPath = path.join(this.scraperPath, 'run_scraper.py');
    this.isRunning = false;
  }

  /**
   * Verifică dacă Scrapy este instalat și configurat
   */
  async checkSetup() {
    try {
      // Verifică dacă directorul există
      if (!fs.existsSync(this.scraperPath)) {
        throw new Error('Scrapy directory not found');
      }

      // Verifică dacă virtual environment există
      if (!fs.existsSync(this.pythonPath)) {
        console.log('⚠️  Python virtual environment not found, using system python3');
        this.pythonPath = 'python3';
      }

      // Verifică dacă scriptul există
      if (!fs.existsSync(this.scriptPath)) {
        throw new Error('Scraper script not found');
      }

      return true;
    } catch (error) {
      console.error('❌ Scrapy setup check failed:', error.message);
      return false;
    }
  }

  /**
   * Instalează dependențele Python necesare
   */
  async installDependencies() {
    return new Promise((resolve, reject) => {
      console.log('📦 Installing Python dependencies...');

      const requirementsPath = path.join(this.scraperPath, 'requirements.txt');
      const pip = spawn('pip3', ['install', '-r', requirementsPath], {
        cwd: this.scraperPath,
        stdio: 'inherit'
      });

      pip.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Python dependencies installed successfully');
          resolve();
        } else {
          reject(new Error(`pip install failed with code ${code}`));
        }
      });

      pip.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Rulează scraper-ul Scrapy pentru colectarea știrilor
   */
  async runScraper() {
    if (this.isRunning) {
      console.log('⚠️  Scraper is already running, skipping...');
      return { success: false, message: 'Scraper already running' };
    }

    return new Promise((resolve, reject) => {
      console.log('🚀 Starting Scrapy news scraper...');
      this.isRunning = true;

      // Setează variabilele de mediu
      const env = {
        ...process.env,
        PYTHONPATH: this.scraperPath,
        SCRAPY_SETTINGS_MODULE: 'news_scraper.settings'
      };

      // Rulează scriptul Python
      const scraper = spawn(this.pythonPath, [this.scriptPath], {
        cwd: this.scraperPath,
        env: env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      scraper.stdout.on('data', (data) => {
        const message = data.toString();
        output += message;
        console.log(`🐍 Scrapy: ${message.trim()}`);
      });

      scraper.stderr.on('data', (data) => {
        const message = data.toString();
        errorOutput += message;
        console.error(`🐍 Scrapy Error: ${message.trim()}`);
      });

      scraper.on('close', (code) => {
        this.isRunning = false;
        
        if (code === 0) {
          console.log('✅ Scrapy scraper completed successfully');
          resolve({
            success: true,
            message: 'Scraping completed successfully',
            output: output,
            articlesProcessed: this.extractArticleCount(output)
          });
        } else {
          console.error(`❌ Scrapy scraper failed with code ${code}`);
          reject({
            success: false,
            message: `Scraper failed with code ${code}`,
            error: errorOutput,
            output: output
          });
        }
      });

      scraper.on('error', (error) => {
        this.isRunning = false;
        console.error('❌ Failed to start Scrapy scraper:', error);
        reject({
          success: false,
          message: 'Failed to start scraper',
          error: error.message
        });
      });

      // Timeout după 5 minute
      setTimeout(() => {
        if (this.isRunning) {
          scraper.kill('SIGTERM');
          this.isRunning = false;
          reject({
            success: false,
            message: 'Scraper timeout after 5 minutes',
            output: output
          });
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Extrage numărul de articole procesate din output-ul Scrapy
   */
  extractArticleCount(output) {
    try {
      // Caută pattern-uri în output pentru numărul de articole
      const patterns = [
        /saved to database: (\d+)/i,
        /articles scraped: (\d+)/i,
        /items passed: (\d+)/i,
        /✅.*(\d+)/g
      ];

      let count = 0;
      for (const pattern of patterns) {
        const matches = output.match(pattern);
        if (matches) {
          const numbers = matches.map(match => {
            const num = match.match(/\d+/);
            return num ? parseInt(num[0]) : 0;
          });
          count = Math.max(count, ...numbers);
        }
      }

      return count;
    } catch (error) {
      console.error('Error extracting article count:', error);
      return 0;
    }
  }

  /**
   * Oprește scraper-ul dacă rulează
   */
  stopScraper() {
    if (this.isRunning) {
      console.log('🛑 Stopping Scrapy scraper...');
      this.isRunning = false;
      return true;
    }
    return false;
  }

  /**
   * Returnează statusul scraper-ului
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      setupValid: fs.existsSync(this.scriptPath),
      pythonPath: this.pythonPath,
      scraperPath: this.scraperPath
    };
  }
}

module.exports = ScrapyService;