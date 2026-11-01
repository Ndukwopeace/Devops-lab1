FROM python:3.12.5-slim AS builder
WORKDIR /build
# Dependency file first so this layer is cached until requirements.txt changes.
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12.5-slim
RUN useradd --system --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=builder /install /usr/local
COPY app ./app
COPY wsgi.py .
USER app
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "wsgi:app"]
