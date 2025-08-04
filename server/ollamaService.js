const axios = require('axios');

class OllamaService {
  constructor(baseUrl = null) {
    // Use Docker service name when running in container, localhost otherwise
    this.baseUrl = baseUrl || process.env.OLLAMA_HOST || 'http://localhost:11434';
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

  async analyzeNewsWithOllama(model, prompt, title, content, url, tokenLimit = 500) {
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
          num_predict: tokenLimit
        }
      }, {
        timeout: 60000
      });

      let analysis;
      try {
        // Extract JSON from response
        const responseText = response.data.response;
        console.log('Raw Ollama response:', responseText.substring(0, 200) + '...');
        
        // Try multiple approaches to extract JSON
        let jsonText = null;
        
        // Approach 1: Find complete JSON object
        const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        } else {
          // Approach 2: Look for JSON between specific markers
          const startMarker = responseText.indexOf('{');
          const endMarker = responseText.lastIndexOf('}');
          if (startMarker !== -1 && endMarker !== -1 && endMarker > startMarker) {
            jsonText = responseText.substring(startMarker, endMarker + 1);
          }
        }
        
        if (jsonText) {
          // Clean up common JSON issues
          jsonText = jsonText
            .replace(/,\s*}/g, '}')  // Remove trailing commas
            .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, ""); // Remove control characters
          
          analysis = JSON.parse(jsonText);
        } else {
          throw new Error('No JSON found in response');
        }
      } catch (parseError) {
        console.error('Error parsing Ollama response:', parseError);
        console.error('Problematic response text:', response.data.response);
        
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

      // Add actual token count from Ollama
      const promptTokens = response.data.prompt_eval_count || 0;
      const responseTokens = response.data.eval_count || 0;
      result.tokens = promptTokens + responseTokens;

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

  async testModel(model, testPrompt = "Hello", tokenLimit = null) {
    try {
      // Use provided token limit or default
      const numPredict = tokenLimit || 10;
      
      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: model,
        prompt: testPrompt,
        stream: false,
        options: {
          num_predict: numPredict
        }
      }, {
        timeout: 45000
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

  async getModelDetails(model) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/show`, {
        name: model
      });

      const modelInfo = response.data;
      return {
        name: model,
        size: modelInfo.details?.parameter_size || 'Unknown',
        family: modelInfo.details?.family || 'Unknown',
        format: modelInfo.details?.format || 'Unknown',
        parameters: modelInfo.details?.parameter_size || 'Unknown',
        quantization: modelInfo.details?.quantization_level || 'Unknown',
        modifiedAt: modelInfo.modified_at,
        digest: modelInfo.digest,
        template: modelInfo.template
      };
    } catch (error) {
      console.error('Error getting model details:', error);
      return {
        name: model,
        size: 'Unknown',
        family: 'Unknown',
        error: error.message
      };
    }
  }

  async chatWithModel(model, message, customPrompt = null, tokenLimit = 300) {
    try {
      const prompt = customPrompt 
        ? `${customPrompt}\n\nUser: ${message}\nAssistant:`
        : `You are a helpful AI assistant. Please respond to the user's message.\n\nUser: ${message}\nAssistant:`;

      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: tokenLimit,
          top_k: 40,
          top_p: 0.9
        }
      }, {
        timeout: 60000
      });

      // Get actual token count from Ollama response
      const promptTokens = response.data.prompt_eval_count || 0;
      const responseTokens = response.data.eval_count || 0;
      const totalTokens = promptTokens + responseTokens;

      return {
        success: true,
        response: response.data.response,
        model: model,
        tokens: totalTokens
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        response: `Error: ${error.message}`,
        model: model,
        tokens: 0
      };
    }
  }

  async streamChatWithModel(model, message, customPrompt = null, onChunk = null, tokenLimit = 300) {
    try {
      const prompt = customPrompt 
        ? `${customPrompt}\n\nUser: ${message}\nAssistant:`
        : `You are a helpful AI assistant. Please respond to the user's message.\n\nUser: ${message}\nAssistant:`;

      const response = await axios.post(`${this.baseUrl}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: tokenLimit,
          top_k: 40,
          top_p: 0.9
        }
      }, {
        timeout: 60000,
        responseType: 'stream'
      });

      let fullResponse = '';
      let totalTokens = 0;

      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          try {
            const lines = chunk.toString().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                
                if (data.response) {
                  fullResponse += data.response;
                  if (onChunk) {
                    onChunk(data.response, false);
                  }
                }
                
                if (data.done) {
                  // Calculate total tokens
                  const promptTokens = data.prompt_eval_count || 0;
                  const responseTokens = data.eval_count || 0;
                  totalTokens = promptTokens + responseTokens;
                  
                  if (onChunk) {
                    onChunk('', true);
                  }
                  
                  resolve({
                    success: true,
                    response: fullResponse,
                    model: model,
                    tokens: totalTokens
                  });
                  return;
                }
              } catch (parseError) {
                // Skip malformed JSON lines
                continue;
              }
            }
          } catch (error) {
            console.error('Error processing chunk:', error);
          }
        });

        response.data.on('error', (error) => {
          console.error('Stream error:', error);
          reject({
            success: false,
            error: error.message,
            model: model,
            tokens: 0
          });
        });

        response.data.on('end', () => {
          if (fullResponse === '') {
            reject({
              success: false,
              error: 'No response received',
              model: model,
              tokens: 0
            });
          }
        });
      });

    } catch (error) {
      console.error('Error in streaming chat:', error);
      return {
        success: false,
        error: error.message,
        response: `Error: ${error.message}`,
        model: model,
        tokens: 0
      };
    }
  }

  // Estimate token count for local models (approximate calculation)
  estimateTokens(text) {
    if (!text) return 0;
    // Rough approximation: ~4 characters per token for English text
    return Math.ceil(text.length / 4);
  }
}

module.exports = OllamaService;