FROM ghcr.io/astral-sh/uv:0.11.19@sha256:b46b03ddfcfbf8f547af7e9eaefdf8a39c8cebcba7c98858d3162bd28cf536f6 AS uv
FROM python:3.14.8-slim-bookworm@sha256:48b13b003dda20b16f9442b8475aa05fe21bf6579a8c881db92ffb4d8fd20f83 AS build

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
WORKDIR /app

COPY --from=uv /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock .python-version ./
COPY packages/simula-core packages/simula-core
COPY services/ai-engine/pyproject.toml services/ai-engine/pyproject.toml
COPY services/api services/api
COPY services/worker/pyproject.toml services/worker/pyproject.toml
RUN uv sync --frozen --no-dev --no-editable --package simula-api

FROM python:3.14.8-slim-bookworm@sha256:48b13b003dda20b16f9442b8475aa05fe21bf6579a8c881db92ffb4d8fd20f83 AS runtime

ENV PATH=/app/.venv/bin:$PATH
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install current bookworm security revisions for scanner-blocked runtime packages.
RUN apt-get update \
    && apt-get install --yes --only-upgrade --no-install-recommends \
        libpcre2-8-0 libssl3 openssl perl-base \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 simula && useradd --uid 10001 --gid simula --no-create-home simula
COPY --from=build --chown=simula:simula /app/.venv /app/.venv
COPY --from=build /app/services/api/certs/supabase-prod-ca-2021.crt /etc/ssl/certs/supabase-prod-ca-2021.crt

USER simula
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=2s --retries=3 CMD ["python", "-c", "import os, urllib.request; port=int(os.getenv('PORT','8000')); urllib.request.urlopen(f'http://127.0.0.1:{port}/health/live', timeout=1)"]
CMD ["python", "-m", "simula_api"]
