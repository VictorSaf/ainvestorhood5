# 🐳 Docker Deployment Guide - AIInvestorHood5

Acest ghid te ajută să rulezi aplicația AIInvestorHood5 în containere Docker pentru un deployment simplu și scalabil.

## 📋 Prerequisite

- **Docker Engine** 20.10+ instalat
- **Docker Compose** v2.0+ instalat
- **4GB RAM** disponibil pentru containere
- **10GB spațiu disc** pentru imagini și date

## 🚀 Quick Start

### 1. Build și Start All Services

```bash
# Clone repository-ul (dacă nu l-ai făcut deja)
git clone <repository-url>
cd ainvestorhood5

# Build și start toate serviciile
docker-compose up --build -d

# Verifică status-ul serviciilor
docker-compose ps
```

### 2. Accesează Aplicația

- **Aplicația principală**: http://localhost:8080
- **Ollama API**: http://localhost:11434
- **Portainer (Monitoring)**: http://localhost:9000
- **Nginx Proxy**: http://localhost:80

## 🔧 Configurare Detaliată

### Environment Variables

Copiază și modifică fișierul de configurare:

```bash
cp .env.docker .env
nano .env
```

Configurează variabilele importante:

```env
# OpenAI API Key (dacă folosești OpenAI)
OPENAI_API_KEY=sk-your-api-key-here

# AI Provider (openai sau ollama)
AI_PROVIDER=ollama

# Security
SESSION_SECRET=your-super-secret-key-here
```

### Doar Aplicația Principală (Minimal)

Dacă vrei să rulezi doar aplicația fără servicii suplimentare:

```bash
# Build doar aplicația
docker build -t ainvestorhood5 .

# Run containerul
docker run -d \
  --name ainvestorhood5 \
  -p 8080:8080 \
  -v ainvestorhood_data:/app/data \
  -e NODE_ENV=production \
  ainvestorhood5
```

## 🤖 Configurare Ollama

### Setup Modele Ollama

```bash
# Intră în containerul Ollama
docker exec -it ainvestorhood_ollama bash

# Download modele recomandate
ollama pull llama2           # Model general (3.8GB)
ollama pull mistral          # Model rapid (4.1GB)  
ollama pull codellama        # Model pentru cod (3.8GB)
ollama pull llama2:13b       # Model mai mare (7.3GB)

# Verifică modelele instalate
ollama list

# Testează un model
ollama run llama2 "Explain financial analysis in simple terms"
```

### Modele Recomandate pentru Analiză Financiară

1. **mistral** - Rapid și eficient pentru analiză text
2. **llama2** - Echilibrat între performanță și calitate
3. **llama2:13b** - Cea mai bună calitate (necesită mai multă RAM)

## 📊 Monitoring și Logs

### Verifică Status Servicii

```bash
# Status toate serviciile
docker-compose ps

# Logs pentru aplicația principală
docker-compose logs -f ainvestorhood

# Logs pentru Ollama
docker-compose logs -f ollama

# Logs pentru toate serviciile
docker-compose logs -f
```

### Health Checks

```bash
# Verifică health status
curl http://localhost:8080/api/setup-status
curl http://localhost:11434/api/tags

# Monitoring cu Portainer
# Deschide http://localhost:9000 în browser
```

## 🔄 Management și Maintenance

### Update Aplicația

```bash
# Pull latest changes
git pull origin main

# Rebuild și restart
docker-compose down
docker-compose up --build -d
```

### Backup Date

```bash
# Backup database
docker run --rm \
  -v ainvestorhood_data:/data \
  -v $(pwd):/backup \
  alpine cp /data/ainvestorhood.db /backup/

# Backup modele Ollama
docker run --rm \
  -v ollama_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/ollama-models.tar.gz /data
```

### Restore Date

```bash
# Restore database
docker run --rm \
  -v ainvestorhood_data:/data \
  -v $(pwd):/backup \
  alpine cp /backup/ainvestorhood.db /data/

# Restore modele Ollama
docker run --rm \
  -v ollama_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/ollama-models.tar.gz -C /
```

## 🛠️ Troubleshooting

### Probleme Comune

#### 1. Port-ul 8080 este ocupat
```bash
# Schimbă portul în docker-compose.yml
ports:
  - "8081:8080"  # Folosește 8081 în loc de 8080
```

#### 2. Ollama nu pornește
```bash
# Verifică logs
docker-compose logs ollama

# Restart serviciul
docker-compose restart ollama
```

#### 3. Lipsă de memorie
```bash
# Verifică utilizarea resurselor
docker stats

# Oprește servicii opționale
docker-compose stop portainer redis nginx
```

#### 4. Database corrupt
```bash
# Șterge volume-ul și restart
docker-compose down -v
docker-compose up -d
```

### Debug Mode

Pentru debugging detaliat:

```bash
# Start cu debug logs
docker-compose -f docker-compose.yml -f docker-compose.debug.yml up

# Sau setează environment variables
export DEBUG=true
export LOG_LEVEL=debug
docker-compose up
```

## 🏭 Production Deployment

### SSL/HTTPS Setup

1. Obține certificate SSL (Let's Encrypt recomandat)
2. Pune certificatele în directorul `./ssl/`
3. Decomentează secțiunea SSL din `nginx.conf`
4. Restart nginx: `docker-compose restart nginx`

### Scalare

```bash
# Scalează aplicația principală
docker-compose up --scale ainvestorhood=3 -d

# Load balancing automat prin nginx
```

### Security Checklist

- [ ] Schimbă `SESSION_SECRET` în producție
- [ ] Setează firewall rules pentru porturi
- [ ] Folosește SSL certificates
- [ ] Regular backup pentru date
- [ ] Monitor logs pentru activitate suspectă
- [ ] Update regulat imaginile Docker

## 📈 Performance Tuning

### Resource Limits

Adaugă în `docker-compose.yml`:

```yaml
services:
  ainvestorhood:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### Cache Optimization

Redis este inclus pentru caching. Pentru a-l activa în aplicație:

```env
REDIS_URL=redis://redis:6379
ENABLE_CACHE=true
```

## 🆘 Support

Pentru probleme sau întrebări:

1. Verifică logs-urile: `docker-compose logs -f`
2. Consultă documentația Docker
3. Verifică GitHub Issues

---

## 📝 Comenzi Utile

```bash
# Start complet
docker-compose up -d

# Start doar aplicația
docker-compose up ainvestorhood -d

# Stop toate serviciile
docker-compose down

# Stop și șterge volume-urile
docker-compose down -v

# Rebuild complet
docker-compose build --no-cache

# Urmărește logs în timp real
docker-compose logs -f ainvestorhood

# Intră în containerul aplicației
docker exec -it ainvestorhood5 sh

# Verifică utilizarea resurselor
docker stats

# Curăță imagini vechi
docker system prune -a
```

Aplicația ta AIInvestorHood5 este acum containerizată și gata pentru deployment! 🚀