# Lucent Backend (NestJS)

## 1) Local development

```bash
npm ci
npm run start:dev
```

## 2) Docker run

### Build image

```bash
docker build -t lucent-backend:local .
```

### Run container

```bash
docker run --rm -p 3000:3000 --env-file .env lucent-backend:local
```

## 3) GitHub Actions CI/CD

Workflow file: `.github/workflows/backend-cicd.yml`

### CI
- Trigger: `pull_request` or `push` to `dev`, `main`
- Steps:
  - `npm ci`
  - `npm run build`
  - `npm run test -- --runInBand --watchman=false`

### CD
- Trigger: `push` to `main`
- Steps:
  - Docker image build
  - Push image to GHCR (`ghcr.io`)
  - SSH deploy to Vultr server

## 4) Required GitHub Secrets

Add these repository secrets:

- `VULTR_HOST`: Vultr server IP or domain
- `VULTR_USER`: SSH user (e.g. `root`)
- `VULTR_SSH_KEY`: private key used by GitHub Actions to access server
- `VULTR_SSH_PORT`: SSH port (optional, default 22)
- `VULTR_HOST_PORT`: host port to expose container (optional, default 3000)
- `VULTR_ENV_FILE_PATH`: absolute `.env` file path on server (optional)
- `GHCR_USERNAME`: GitHub username that can read package from GHCR
- `GHCR_PAT`: Personal Access Token with `read:packages`

## 5) Server prerequisites (Vultr)

Install Docker on the server, then prepare runtime env file.

Example:

```bash
mkdir -p /opt/lucent/backend
cat > /opt/lucent/backend/.env <<'ENV'
NODE_ENV=production
PORT=3000
# Add app secrets below
ENV
```

If `VULTR_ENV_FILE_PATH` is set to `/opt/lucent/backend/.env`, the deploy workflow attaches it automatically.

## 6) Branch strategy for deployment

- Feature branch: CI only
- `dev` branch: CI + Docker image push
- `main` branch: CI + Docker image push + Vultr deploy

If you want auto deploy from `dev`, change deploy job condition in `.github/workflows/backend-cicd.yml`.
