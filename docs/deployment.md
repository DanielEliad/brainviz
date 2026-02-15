# Deployment Guide

BrainViz runs on a Hetzner VPS behind Cloudflare. Docker images are built in CI and pushed to GitHub Container Registry (GHCR). The server just pulls images — no builds, no git, no rsync.

## Architecture

```
Internet → Cloudflare (SSL, DDoS, caching)
               │
               ▼ HTTP on port 80
        ┌──────────────────┐
        │  gateway (nginx)  │  Routes by hostname
        └──────┬───────────┘
               │
    ┌──────────┼───────────┐
    ▼          ▼           ▼
brainviz.   portfolio.   future.example.com
example.com  example.com
    │         static HTML
    ▼
brainviz-nginx (SPA + /api/ proxy)
    │
    ▼
brainviz-backend (:8000)
```

## Repos

| Repo | What it owns | Images |
|------|-------------|--------|
| `website` | Gateway nginx config, docker-compose, portfolio | None (uses stock `nginx:alpine`) |
| `brainviz` | Backend + frontend code | `ghcr.io/.../backend`, `ghcr.io/.../nginx` |

## Deploy Flow

1. Push to `main` in brainviz repo
2. CI runs tests
3. CI builds frontend, then builds + pushes two Docker images to GHCR
4. CI SSHs into server: `docker compose pull && docker compose up -d`
5. Health check

The server only runs `docker compose pull` — no builds happen there.

## Server Directory Layout

```
/opt/
├── website/repo/           # website repo (docker-compose + nginx config)
└── brainviz/
    └── data/               # ABIDE data, wavelet.h5, phenotypics.csv
```

No brainviz source code on the server. Just the data directory and the website repo for docker-compose.

## One-Time Setup

### 1. Hetzner

1. Create a CX22 server (2 vCPU, 4GB RAM, ~$3.75/mo), Debian 12
2. Note the server IP

### 2. Domain + Cloudflare

1. Purchase a domain, point nameservers to Cloudflare
2. Create DNS records (orange cloud = proxied):
   - `A` — `example.com` → server IP
   - `A` — `*.example.com` → server IP
3. SSL/TLS mode: **Full**, enable "Always Use HTTPS"

### 3. Server Provisioning

SSH in as root:

```bash
apt update && apt upgrade -y
apt install -y ufw fail2ban docker.io docker-compose-plugin git
```

Firewall:

```bash
ufw allow ssh
ufw allow 80/tcp
ufw enable
```

Create deploy user:

```bash
useradd -m -s /bin/bash -G docker deploy
mkdir -p /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys   # add your key + CI deploy key
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys
```

Harden SSH (`/etc/ssh/sshd_config`):

```
PermitRootLogin no
PasswordAuthentication no
```

Then `systemctl restart sshd`.

### 4. Application Setup

As the `deploy` user:

```bash
# Website repo (docker-compose + gateway config)
sudo mkdir -p /opt/website
sudo chown deploy:deploy /opt/website
git clone git@github.com:YOUR_USER/website.git /opt/website/repo

# Brainviz data
sudo mkdir -p /opt/brainviz
sudo chown deploy:deploy /opt/brainviz
mkdir -p /opt/brainviz/data
```

Upload data from your local machine:

```bash
rsync -avz --progress data/ deploy@<SERVER_IP>:/opt/brainviz/data/
```

### 5. GitHub Actions Secrets

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | Server IP address |
| `SSH_PRIVATE_KEY` | Private key for the deploy user |
| `DEPLOY_DOMAIN` | `brainviz.example.com` |

Generate a deploy key:

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f deploy_key -N ""
```

### 6. First Deploy

Push to `main` to trigger CI, or pull images manually:

```bash
cd /opt/website/repo
docker compose pull
docker compose up -d
```

## Connecting to the Server

```bash
ssh deploy@<SERVER_IP>
```

Or add to `~/.ssh/config`:

```
Host brainviz
    HostName <SERVER_IP>
    User deploy
    IdentityFile ~/.ssh/your_key
```

## Common Operations

### View logs

```bash
cd /opt/website/repo
docker compose logs -f                    # all
docker compose logs -f brainviz-backend   # backend only
docker compose logs -f gateway            # gateway nginx
```

### Restart

```bash
cd /opt/website/repo
docker compose restart
```

### Manual redeploy (pull latest images)

```bash
cd /opt/website/repo
docker compose pull
docker compose up -d
```

### Check status

```bash
docker compose ps
curl -H "Host: brainviz.example.com" http://localhost/api/health
docker stats --no-stream
```

### Update data

From local machine:

```bash
rsync -avz --progress data/ deploy@<SERVER_IP>:/opt/brainviz/data/
ssh deploy@<SERVER_IP> "cd /opt/website/repo && docker compose restart brainviz-backend"
```

## Adding a New Subdomain

1. Add a `server` block to `website/nginx.conf` proxying to the new service
2. Add the service to `website/docker-compose.yml` (image from GHCR or static files)
3. `cd /opt/website/repo && git pull && docker compose up -d`
4. Wildcard DNS already covers `*.example.com`

## Scaling Up

Hetzner Cloud Console → Rescale → CX32 (4 vCPU, 8GB, ~$7/mo). Same IP, server reboots.

## Troubleshooting

**Container won't start**: `docker compose logs`. Common: missing data at `/opt/brainviz/data/`.

**502 Bad Gateway**: backend or brainviz-nginx down. Check `docker compose ps` and `docker compose logs`.

**SSL errors**: Cloudflare SSL mode must be "Full", DNS record must be proxied (orange cloud).

**Rate limited (429)**: brainviz-nginx limits API to 5 req/sec per IP, burst 10. Edit `nginx/nginx.conf` in the brainviz repo and redeploy.

**Can't pull images**: ensure the GHCR packages are public, or `docker login ghcr.io` on the server.
