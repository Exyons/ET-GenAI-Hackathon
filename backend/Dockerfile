FROM python:3.11-slim

WORKDIR /app

# System deps for audio (ffmpeg) and building native extensions
RUN apt-get update && apt-get install -y ffmpeg build-essential curl && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Copy dependency files first (layer cache)
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy application code and data
COPY . .

# Pre-download the default embedding model (all-MiniLM-L6-v2) so it's cached in the image
RUN uv run python -c "from chromadb.utils.embedding_functions import DefaultEmbeddingFunction; DefaultEmbeddingFunction()(['warmup']); print('Embedding model cached: all-MiniLM-L6-v2')"

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
