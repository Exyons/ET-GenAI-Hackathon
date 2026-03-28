FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the project
COPY . .

# Build the Next.js app
RUN bun run build

EXPOSE 3000

CMD ["bun", "run", "start"]
