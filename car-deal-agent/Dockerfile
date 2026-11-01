# Web app: build the frontend, then run the FastAPI app that serves it and the API.
FROM node:22-alpine AS frontend
WORKDIR /web
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    FRONTEND_DIST=/app/frontend/dist DATA_DIR=/tmp/autohalle PORT=8000
WORKDIR /app
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install ".[web]" && useradd --create-home app
COPY --from=frontend /web/dist ./frontend/dist
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/health')" || exit 1
CMD ["cardeal-web"]
