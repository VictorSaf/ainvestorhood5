const Database = require('./database');

async function checkDatabase() {
  const db = new Database();
  
  console.log('🔍 Checking database contents...');
  
  try {
    const articles = await db.getRecentArticles(100);
    console.log(`📊 Total articles in database: ${articles.length}`);
    
    if (articles.length > 0) {
      console.log('\n📰 Recent articles:');
      articles.slice(0, 5).forEach((article, index) => {
        console.log(`${index + 1}. ${article.title.substring(0, 60)}...`);
        console.log(`   Created: ${article.created_at}`);
        console.log(`   Published: ${article.published_at}`);
        console.log(`   Recommendation: ${article.recommendation} (${article.confidence_score}%)`);
        console.log('   ---');
      });
    } else {
      console.log('❌ No articles found in database!');
    }
    
  } catch (error) {
    console.error('Database error:', error);
  }
  
  db.close();
  process.exit(0);
}

checkDatabase();