FROM node:20-slim

# Install Java, C++, and Python compilers/interpreters
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    openjdk-17-jdk-headless \
    g++ \
    gcc \
    python3 \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application
COPY . .

# Set dynamic PORT (Render provides this)
ENV PORT=10000
EXPOSE 10000

CMD ["node", "server.js"]
