FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for audio processing (ffmpeg) and building
RUN apt-get update && apt-get install -y ffmpeg build-essential curl && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Copy the dependency files first to cache the uv install layer
COPY pyproject.toml uv.lock* ./

# Install dependencies using uv
RUN uv pip install --system -r pyproject.toml

# Copy the application code
COPY . .

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
