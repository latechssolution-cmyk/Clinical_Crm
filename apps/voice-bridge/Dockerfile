# Build from the REPO ROOT so workspace packages resolve:
#   docker build -f apps/voice-bridge/Dockerfile -t voice-bridge .
FROM node:22-slim

WORKDIR /app

# Workspace manifests first for layer-cached installs
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/voice-bridge/package.json apps/voice-bridge/

# Note: dev deps included — tsx runs the TypeScript sources directly.
RUN npm ci --workspace apps/voice-bridge --include-workspace-root=false \
  && npm cache clean --force

# Sources (core is consumed as TypeScript via tsx)
COPY packages/core packages/core
COPY apps/voice-bridge apps/voice-bridge

ENV NODE_ENV=production
EXPOSE 8080

WORKDIR /app/apps/voice-bridge
CMD ["npx", "tsx", "src/index.ts"]
