FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies using bun
RUN bun install

# Copy the rest of the project
COPY . .

# Build the Next.js app
RUN bun run build

# Start the application
CMD ["bun", "run", "start"]
