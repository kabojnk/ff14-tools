# Deployment Guide

Instructions for deploying the chat system to a DigitalOcean droplet using Docker.

## Prerequisites

- A DigitalOcean account
- Docker and Docker Compose installed on your local machine (for building)
- SSH access to your droplet
- Supabase project fully configured (see [SETUP.md](./SETUP.md))
- A domain name (optional but recommended for HTTPS)

---

## 1. Create a DigitalOcean Droplet

1. Log into [DigitalOcean](https://cloud.digitalocean.com)
2. Create a new Droplet:
   - **Image**: Ubuntu 24.04 LTS
   - **Plan**: Basic, $6/mo (1 vCPU, 1GB RAM) is sufficient
   - **Region**: Choose one close to you
   - **Authentication**: SSH keys recommended
3. Note the droplet's IP address

## 2. Set Up the Droplet

SSH into your droplet and install Docker:

```bash
ssh root@YOUR_DROPLET_IP

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install -y docker-compose-plugin

# Verify
docker --version
docker compose version
```

## 3. Deploy the Application

### Option A: Build on the droplet

Clone or copy your project to the droplet:

```bash
# On the droplet
mkdir -p /opt/chat-system
cd /opt/chat-system
```

Copy your project files to the droplet (from your local machine):

```bash
# From your local machine
scp -r ./* root@YOUR_DROPLET_IP:/opt/chat-system/
```

Create the `.env` file on the droplet:

```bash
# On the droplet
cat > /opt/chat-system/.env << 'EOF'
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_TENOR_API_KEY=your-tenor-api-key
VITE_BUNNY_CDN_URL=https://your-pullzone.b-cdn.net
EOF
```

Build and start:

```bash
cd /opt/chat-system
docker compose up -d --build
```

### Option B: Build locally, push image

Build the Docker image locally:

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://your-project.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=your-anon-key \
  --build-arg VITE_TENOR_API_KEY=your-tenor-api-key \
  --build-arg VITE_BUNNY_CDN_URL=https://your-pullzone.b-cdn.net \
  -f docker/Dockerfile \
  -t chat-system:latest \
  .
```

Save and transfer:

```bash
docker save chat-system:latest | gzip > chat-system.tar.gz
scp chat-system.tar.gz root@YOUR_DROPLET_IP:/opt/
```

Load and run on the droplet:

```bash
ssh root@YOUR_DROPLET_IP
docker load < /opt/chat-system.tar.gz
docker run -d --name chat-system -p 80:80 --restart unless-stopped chat-system:latest
```

## 4. Verify

Open `http://YOUR_DROPLET_IP` in a browser. You should see the login page.

## 5. Set Up HTTPS (Recommended)

### Using Caddy as a reverse proxy

Install Caddy on the droplet:

```bash
apt install -y caddy
```

Edit `/etc/caddy/Caddyfile`:

```
your-domain.com {
    reverse_proxy localhost:80
}
```

Update docker-compose.yml to use a non-conflicting port (e.g., 8080:80), then:

```bash
docker compose down
# Edit docker-compose.yml: change "80:80" to "8080:80"
docker compose up -d --build
systemctl restart caddy
```

Caddy automatically provisions and renews HTTPS certificates via Let's Encrypt.

### Using Nginx + Certbot

```bash
apt install -y nginx certbot python3-certbot-nginx

# Set up Nginx reverse proxy
cat > /etc/nginx/sites-available/chat << 'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/chat /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get HTTPS certificate
certbot --nginx -d your-domain.com
```

## 6. Updating

To deploy updates:

```bash
# On the droplet
cd /opt/chat-system
git pull  # or scp new files
docker compose up -d --build
```

## 7. Monitoring

View logs:

```bash
docker compose logs -f
```

Check container status:

```bash
docker compose ps
```

Restart:

```bash
docker compose restart
```

## 8. Security Notes

- The `.env` file contains secrets. Ensure it's not committed to version control.
- Consider setting up a firewall (`ufw allow 80,443/tcp` and `ufw enable`).
- The app's login page is intentionally non-descript ("Internal Tools Portal") to avoid drawing attention.
- Supabase handles authentication — there are no passwords stored in this application.
- All database access is governed by Row Level Security policies.
