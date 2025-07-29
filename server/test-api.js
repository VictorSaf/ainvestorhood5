const axios = require('axios');

async function testAPI() {
  try {
    console.log('🧪 Testing API endpoint...');
    
    const response = await axios.get('http://localhost:8080/api/news?limit=10');
    console.log(`📡 API Response: ${response.status}`);
    console.log(`📰 Articles returned: ${response.data.length}`);
    
    if (response.data.length > 0) {
      console.log('\n🔍 First article structure:');
      const firstArticle = response.data[0];
      console.log(JSON.stringify(firstArticle, null, 2));
    } else {
      console.log('❌ No articles returned by API!');
    }
    
  } catch (error) {
    console.error('API Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testAPI();