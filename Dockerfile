# Stage 1: Build client
FROM node:20-alpine AS client-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# 프로덕션에서는 같은 origin이므로 빈 값 (상대 경로 사용)
ARG VITE_SOCKET_URL=""

RUN npm run build

# Stage 2: Build server
FROM node:20-alpine AS server-builder

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner

WORKDIR /app

# 서버 의존성만 설치
COPY server/package*.json ./server/
RUN cd server && npm ci --only=production

# 빌드된 서버 복사
COPY --from=server-builder /app/server/dist ./server/dist

# 빌드된 클라이언트 복사
COPY --from=client-builder /app/client/dist ./client/dist

WORKDIR /app/server

ENV NODE_ENV=production

# Railway가 PORT 환경변수를 제공함
CMD ["node", "dist/index.js"]
