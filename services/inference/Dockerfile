FROM python:3.11-slim AS builder
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY pyproject.toml ./
COPY app/__init__.py app/__init__.py
RUN pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir '.[grace]'

FROM python:3.11-slim AS runner
RUN groupadd --system app && useradd --system --gid app app && mkdir -p /app/model && chown app:app /app/model
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app app ./app
COPY --chown=app:app src ./src
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/tmp/huggingface
EXPOSE 8000
CMD ["/bin/sh", "-c", "chown app:app /app/model && exec su -s /bin/sh app -c 'exec /opt/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000'"]
