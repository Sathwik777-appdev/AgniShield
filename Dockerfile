# Multi-stage production Dockerfile for AgniShield
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.11-slim
WORKDIR /app

# Install system dependencies for build tools and PostgreSQL client libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r ./backend/requirements.txt psycopg2-binary

# Copy backend files and built frontend assets
COPY backend/ ./backend/
COPY --from=frontend-builder /app/dist ./dist

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV PG_HOST=postgres
ENV PG_PORT=5432
ENV PG_USER=agnishield_user
ENV PG_PASSWORD=agnishield_secure_pwd
ENV PG_DB=agnishield_db

EXPOSE 8000

CMD ["sh", "-c", "python3 -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
