const axios = require('axios');

class OllamaService {
  constructor(baseUrl = null) {
    // Use Docker service name when running in container, localhost otherwise
    this.baseUrl = baseUrl || process.env.OLLAMA_HOST || 'http://ollama:11434';
  }

  async getAvailableModels() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`);
      return response.data.models || [];
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
      return [];
    }
  }

  async isOllamaRunning() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async analyzeNewsWithOllama(model, prompt, title, content, url) {
    try {
      const analysisPrompt = `${prompt}

Article Title: ${title}

Content: ${content}

URL: ${url}

Please analyze this financial news article and provide your response in JSON format with the following structure:
{
  "summary": "concise summary in max 100 words",
  "instrument_type": "stocks/forex/crypto/commodities/indices",
  "instrument_name": "specific instrument name if mentioned or null",
  "recommendation": "BUY/SELL/HOLD",
  "confidence_score": "number between 1-100"
}`;

      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: model,
        prompt: analysisPrompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 500
        }
      }, {
        timeout: 30000
      });

      let analysis;
      try {
        // Extract JSON from response
        const responseText = response.data.response;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('Error parsing Ollama response:', parseError);
        // Fallback analysis
        analysis = {
          summary: `Analysis of: ${title.substring(0, 80)}...`,
          instrument_type: 'stocks',
          instrument_name: null,
          recommendation: 'HOLD',
          confidence_score: 50
        };
      }

      // Ensure all required fields exist with defaults
      const result = {
        summary: analysis.summary || `Analysis of: ${title.substring(0, 80)}...`,
        instrument_type: analysis.instrument_type || 'stocks',
        instrument_name: analysis.instrument_name || null,
        recommendation: analysis.recommendation || 'HOLD',
        confidence_score: parseInt(analysis.confidence_score) || 50
      };

      // Validate recommendation
      if (!['BUY', 'SELL', 'HOLD'].includes(result.recommendation)) {
        result.recommendation = 'HOLD';
      }

      // Validate confidence score
      result.confidence_score = Math.max(1, Math.min(100, result.confidence_score));

      return result;

    } catch (error) {
      console.error('Error analyzing with Ollama:', error);
      
      // Return default analysis to prevent errors
      return {
        summary: `Financial news analysis for: ${title.substring(0, 80)}...`,
        instrument_type: 'stocks',
        instrument_name: null,
        recommendation: 'HOLD',
        confidence_score: 50
      };
    }
  }

  async testModel(model, testPrompt = "Hello, please respond with 'Hello World' in JSON format: {\"response\": \"Hello World\"}") {
    try {
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: model,
        prompt: testPrompt,
        stream: false,
        options: {
          num_predict: 50
        }
      }, {
        timeout: 15000
      });

      return {
        success: true,
        response: response.data.response,
        model: model
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        model: model
      };
    }
  }
}

module.exports = OllamaService;