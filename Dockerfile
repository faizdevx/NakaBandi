# One service for Railway: FastAPI serves both the API and the built frontend.
# Docker Compose keeps using frontend/Dockerfile and backend/Dockerfile.
FROM node:24-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.14-slim
WORKDIR /srv
COPY backend/pyproject.toml ./
COPY backend/app ./app
RUN pip install --no-cache-dir .
COPY --from=web /web/dist ./static
ENV STATIC_DIR=/srv/static
USER nobody
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
