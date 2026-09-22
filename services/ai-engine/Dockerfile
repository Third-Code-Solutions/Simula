FROM ghcr.io/astral-sh/uv:0.11.19@sha256:b46b03ddfcfbf8f547af7e9eaefdf8a39c8cebcba7c98858d3162bd28cf536f6 AS uv
FROM python:3.14.7-slim-bookworm@sha256:23c59390fc717bf09f9336908199a0ae75d9c4264bf296123f94ad772fea3b52 AS build

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy
WORKDIR /app

COPY --from=uv /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock .python-version ./
COPY packages/simula-core packages/simula-core
COPY services/ai-engine services/ai-engine
COPY services/api/pyproject.toml services/api/pyproject.toml
COPY services/worker/pyproject.toml services/worker/pyproject.toml
RUN uv sync --frozen --no-dev --no-editable --package simula-ai-engine

FROM python:3.14.7-slim-bookworm@sha256:23c59390fc717bf09f9336908199a0ae75d9c4264bf296123f94ad772fea3b52 AS runtime

ENV PATH=/app/.venv/bin:$PATH
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# The pinned bookworm base ships libpcre2-8-0 10.42-1, which the container gate
# blocks as fixable High (CVE-2026-86145 / CVE-2026-89157 / CVE-2026-89161).
# The +deb12u1 revision is published only in bookworm-security, so upgrade it
# from there rather than relaxing the gate.
RUN apt-get update \
    && apt-get install --yes --only-upgrade --no-install-recommends libpcre2-8-0 \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 10001 simula && useradd --uid 10001 --gid simula --no-create-home simula
COPY --from=build --chown=simula:simula /app/.venv /app/.venv

USER simula
EXPOSE 8010
HEALTHCHECK --interval=10s --timeout=2s --retries=3 CMD ["python", "-c", "import os, urllib.request; port=int(os.getenv('PORT','8010')); urllib.request.urlopen(f'http://127.0.0.1:{port}/health/live', timeout=1)"]
CMD ["python", "-m", "simula_ai_engine"]
