# === UNIFIED DOCKERFILE - INTELLIGENT MCP SYSTEM ===
FROM node:22-bullseye
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python3-pip \
    chromium \
    chromium-driver \
    firefox-esr \
    xvfb \
    && rm -rf /var/lib/apt/lists/*

# Install UV for Python package management
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:$PATH"

# Install pnpm
RUN npm install -g pnpm

# Set environment variables early
ENV NODE_ENV=production
ENV DOCKER_ENV=true
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV UV_PYTHON=3.12
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV DISPLAY=:99

# Copy package files and scripts
COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY scripts ./scripts
COPY lib ./lib

# Temporarily modify package.json to remove postinstall script
RUN cp package.json package.json.orig && \
    node -e "const pkg=require('./package.json'); delete pkg.scripts.postinstall; require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2))"

# Install dependencies with frozen lockfile
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# Restore original package.json
RUN mv package.json.orig package.json

# Now copy the rest of the application
COPY . .

# Run postinstall script manually
RUN pnpm tsx scripts/postinstall.ts

# Install Python dependencies
RUN pip3 install --no-cache-dir --upgrade pip setuptools wheel

# Install Python MCP dependencies with detailed logging
RUN echo "🐍 Installing Python MCP dependencies..." && \
    pip3 install --no-cache-dir \
        mcp>=1.0.0 \
        python-pptx>=0.6.21 \
        pandas>=2.0.0 \
        numpy>=1.24.0 \
        openpyxl>=3.1.0 && \
    echo "✅ Python packages installed successfully"

# Verify Python installations
RUN echo "🔍 Verifying Python installations..." && \
    python3 -c "import mcp; print(f'✅ MCP: {mcp.__version__ if hasattr(mcp, \"__version__\") else \"installed\"}')" && \
    python3 -c "import pptx; print(f'✅ python-pptx: {pptx.__version__}')" && \
    python3 -c "import pandas; print(f'✅ pandas: {pandas.__version__}')" && \
    python3 -c "import numpy; print(f'✅ numpy: {numpy.__version__}')" && \
    python3 -c "import openpyxl; print(f'✅ openpyxl: {openpyxl.__version__}')" && \
    echo "🎉 All Python MCP dependencies verified!" || \
    (echo "❌ Python dependency verification failed" && exit 1)

# Install stable MCP packages globally for faster startup
RUN npm install -g \
    time-mcp \
    @pinkpixel/web-scout-mcp \
    @upstash/context7-mcp \
    @modelcontextprotocol/server-memory \
    || echo "Some MCP packages failed to install, will use npx fallback"

# Set permissions for custom MCP servers
RUN chmod +x custom-mcp-server/*.js || echo "No custom MCP scripts found"

# Build application
RUN pnpm build

EXPOSE 3000

CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]