# Lucent Backend (NestJS)

## 1) Local development

```bash
npm ci
npm run start:dev
```

## 2) API overview

- `GET /` : starter response
- `GET /health` : health check
- `POST /notifications/kakao/alimtalk` : Sendon 알림톡 전송

Request example:

```bash
curl -X POST http://localhost:3000/notifications/kakao/alimtalk \
  -H 'Content-Type: application/json' \
  -d '{
    "recipientPhone": "010-1234-5678",
    "templateCode": "WELCOME",
    "message": "환영합니다",
    "templateVariables": {
      "name": "홍길동"
    }
  }'
```

## 3) Sendon runtime config

### Default mode
- `SENDON_ENABLED=true`
- `SENDON_MOCK=true`

기본은 mock 모드라 실제 발송 없이 내부 로그/응답만 반환합니다.

### Environment variables

- `PORT` (default: `3000`)
- `CORS_ORIGINS` (comma-separated)
- `SENDON_ENABLED` (`true`/`false`)
- `SENDON_MOCK` (`true`/`false`)
- `SENDON_API_KEY`
- `SENDON_API_SECRET`
- `SENDON_SENDER_KEY`
- `SENDON_BASE_URL` (optional)
- `SENDON_SDK_PACKAGE` (default: `@sendon/sdk`)
- `SENDON_SDK_CLIENT_FACTORY` (default: `createClient`)
- `SENDON_SDK_CLIENT_CLASS` (default: `SendonClient`)
- `SENDON_SDK_SEND_METHOD` (default: `sendAlimtalk`)

### Supabase (type-safe client)

- DB 타입 파일: `src/types/database.ts`
- Supabase 클라이언트 유틸: `src/supabase/supabase.client.ts`
- 필수 env:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### Production (real SDK send)

1. Sendon SDK 패키지를 프로젝트에 설치
2. `SENDON_MOCK=false`로 설정
3. SDK 구조에 맞게 factory/class/method env 값 조정

## 4) Docker run

### Build image

```bash
docker build -t lucent-backend:local .
```

### Run container

```bash
docker run --rm -p 3000:3000 --env-file .env lucent-backend:local
```

## 5) GitHub Actions CI/CD

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

## 6) Required GitHub Secrets

Add these repository secrets:

- `VULTR_HOST`: Vultr server IP or domain
- `VULTR_USER`: SSH user (e.g. `root`)
- `VULTR_SSH_KEY`: private key used by GitHub Actions to access server
- `VULTR_SSH_PORT`: SSH port (optional, default 22)
- `VULTR_HOST_PORT`: host port to expose container (optional, default 3000)
- `VULTR_ENV_FILE_PATH`: absolute `.env` file path on server (optional)
- `GHCR_USERNAME`: GitHub username that can read package from GHCR
- `GHCR_PAT`: Personal Access Token with `read:packages`

## 7) Server prerequisites (Vultr)

Install Docker on the server, then prepare runtime env file.

Example:

```bash
mkdir -p /opt/lucent/backend
cat > /opt/lucent/backend/.env <<'ENV'
NODE_ENV=production
PORT=3000
SENDON_ENABLED=true
SENDON_MOCK=false
SENDON_API_KEY=replace-me
SENDON_API_SECRET=replace-me
SENDON_SENDER_KEY=replace-me
# Optional
# SENDON_BASE_URL=https://...
# SENDON_SDK_PACKAGE=@sendon/sdk
# SENDON_SDK_CLIENT_FACTORY=createClient
# SENDON_SDK_CLIENT_CLASS=SendonClient
# SENDON_SDK_SEND_METHOD=sendAlimtalk
ENV
```

If `VULTR_ENV_FILE_PATH` is set to `/opt/lucent/backend/.env`, the deploy workflow attaches it automatically.

## 8) Branch strategy for deployment

- Feature branch: CI only
- `dev` branch: CI + Docker image push
- `main` branch: CI + Docker image push + Vultr deploy

If you want auto deploy from `dev`, change deploy job condition in `.github/workflows/backend-cicd.yml`.
