# Lucent Backend (NestJS)

## 1) Local development

```bash
npm ci
npm run start:dev
```

## 2) API overview

All endpoints use `/api` prefix.

- `GET /api/` : starter response
- `GET /api/health` : health check
- `POST /api/notifications/kakao/alimtalk` : Sendon 알림톡 전송
- `GET /api/products` : 상품 목록 조회 (`ids`, `page`, `limit`, `projectId`, `type` 지원)
- `GET /api/products/:id` : 상품 상세 조회
- `GET /api/products/slug/:slug` : 상품 slug 조회
- `GET /api/products/:id/sample` : 샘플 오디오 스트리밍
- `GET /api/projects` : 프로젝트 목록 조회
- `GET /api/projects/:id` : 프로젝트 상세 조회
- `GET /api/projects/slug/:slug` : 프로젝트 slug 조회
- `GET /api/artists` : 아티스트 목록 조회 (`projectId` 지원)
- `GET /api/artists/:id` : 아티스트 상세 조회
- `GET /api/artists/slug/:slug` : 아티스트 slug 조회
- `GET /api/address/search` : 카카오 주소 검색 프록시 (`query`, `page`, `size`)
- `POST /api/auth/send-verification` : 회원가입 이메일 인증코드 발송
- `POST /api/auth/verify-code` : 이메일 인증코드 검증
- `GET /api/auth/verify-email` : 이메일 링크 인증 후 프론트 페이지로 리다이렉트
- `POST /api/auth/signup` : 인증 토큰 기반 회원가입 + 세션 발급
- `POST /api/auth/login` : 로그인
- `POST /api/auth/logout` : 로그아웃(토큰 검증)
- `GET /api/auth/session` : 세션 확인 (`Authorization: Bearer <token>`)
- `POST /api/auth/reset-password` : 비밀번호 재설정 메일 발송
- `POST /api/auth/update-password` : 재설정 토큰으로 비밀번호 변경
- `GET /api/profiles` : 내 프로필 조회 (`Authorization` 필요)
- `GET /api/profiles/me` : 내 프로필 조회 (`Authorization` 필요)
- `PATCH /api/profiles/me` : 내 프로필 수정 (`Authorization` 필요)
- `GET /api/profiles/:id` : 프로필 조회
- `PATCH /api/profiles/:id` : 프로필 수정 (`Authorization` 필요, 본인만)
- `GET /api/cart` : 장바구니 조회 (`Authorization` 필요)
- `POST /api/cart` : 장바구니 상품 추가 (`Authorization` 필요)
- `DELETE /api/cart` : 장바구니 비우기 (`Authorization` 필요)
- `GET /api/cart/count` : 장바구니 아이템 수 조회 (비로그인 시 `0`)
- `PATCH /api/cart/:itemId` : 장바구니 아이템 수량 변경 (`Authorization` 필요)
- `DELETE /api/cart/:itemId` : 장바구니 아이템 삭제 (`Authorization` 필요)
- `GET /api/orders` : 주문 목록 조회 (사용자/관리자)
- `POST /api/orders` : 주문 생성
- `GET /api/orders/:id` : 주문 상세 조회
- `PATCH /api/orders/:id` : 주문 상태 변경 (관리자)
- `DELETE /api/orders/:id` : 주문 취소 (사용자, `PENDING`만)
- `PATCH /api/orders/:id/status` : 주문 상태 변경 (관리자)
- `PATCH /api/orders/:id/items/status` : 주문 아이템 상태 일괄 변경 (관리자)
- `GET /api/orders/:id/items/:itemId/download` : 디지털 상품 다운로드 URL 생성
- `GET /api/orders/:id/items/:itemId/shipment` : 배송 추적 정보 조회
- `PATCH /api/admin/orders/bulk-update` : 주문 상태 일괄 변경 (관리자)
- `GET /api/users/me/voicepacks` : 내 보이스팩 목록 조회
- `GET /api/download/:productId` : 레거시 상품 다운로드 리다이렉트
- `GET /api/logs` : 로그 목록 조회 (관리자, 필터/검색/페이지네이션)
- `GET /api/logs/:id` : 로그 단건 조회 (관리자)
- `GET /api/logs/stats` : 로그 통계 조회 (관리자)

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
- `KAKAO_REST_API_KEY` (주소 검색 API 사용 시)
- `ADMIN_EMAILS` (comma-separated, 세션 응답의 관리자 판별)
- `FRONTEND_APP_URL` (이메일 인증/비밀번호 재설정 리다이렉트 기준 URL)

### Supabase (type-safe client)

- DB 타입 파일: `src/types/database.ts`
- Supabase 클라이언트 유틸: `src/supabase/supabase.client.ts`
- 필수 env:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
- 권장 env:
  - `SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

### SMTP (Auth 이메일 인증/비밀번호 재설정)

- `SMTP_HOST` (default: `smtp.gmail.com`)
- `SMTP_PORT` (default: `587`)
- `SMTP_SECURE` (`true`/`false`, optional)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (optional, 미설정 시 `SMTP_USER` 사용)

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
