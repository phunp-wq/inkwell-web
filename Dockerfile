FROM node:20-slim

# System deps: python3 + trafilatura (extraction fallback), curl for Meilisearch installer, ca-certs
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv \
      curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Trafilatura in a venv so we don't fight PEP 668
RUN python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir trafilatura
ENV PYTHON_PATH=/opt/venv/bin/python3

# Meilisearch binary
RUN curl -sL https://install.meilisearch.com | sh && \
    mv ./meilisearch /usr/local/bin/meilisearch && \
    chmod +x /usr/local/bin/meilisearch

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 3777

# Meilisearch in background (bound to localhost, persisted at /data),
# Express in foreground. SIGTERM from Railway will kill the foreground node,
# Meilisearch is best-effort flushed on container stop.
CMD ["sh", "-c", "mkdir -p /data && meilisearch --no-analytics --db-path /data --master-key \"$MEILI_MASTER_KEY\" --http-addr 127.0.0.1:7700 & node server.js"]
