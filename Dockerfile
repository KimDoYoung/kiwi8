# ============================================================
# kiwi8 Dockerfile
# Stage 1: React 빌드
# Stage 2: FastAPI + React dist 통합 이미지
# ============================================================

# ── Stage 1: React 빌드 ──────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# ── Stage 2: Python 런타임 ───────────────────────────────────
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Asia/Seoul \
    UV_CACHE_DIR=/tmp/.cache/uv

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# uv 설치
RUN pip install uv

WORKDIR /app

# 의존성 설치 (소스 복사 전에 캐시 활용)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# 소스 복사
COPY backend/ ./backend/

# React 빌드 결과물 복사
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 8003

CMD ["uv", "run", "uvicorn", "backend.main:app", \
     "--host", "0.0.0.0", "--port", "8003"]

