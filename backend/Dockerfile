FROM python:3.11-slim@sha256:6f31d6e9ba2b0a787a3f81c37b004155b87b9efa1b771182bd550c1615745be5

COPY --from=ghcr.io/astral-sh/uv:0.12.23@sha256:61d393e44e249f2e4b526b6c7ddcecce245946826e608e11c93ad4f5bba55b21 /uv /usr/local/bin/uv

WORKDIR /app/backend
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project && rm /usr/local/bin/uv

COPY app/ ./app/

RUN useradd --system --no-create-home brainviz
USER brainviz

EXPOSE 8000
CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
