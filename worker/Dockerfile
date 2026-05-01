FROM node:20-bookworm

# git, gh CLI not required (we use REST API directly)
RUN apt-get update && apt-get install -y --no-install-recommends \
      git ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install --omit=dev && npm install --no-save tsx typescript

COPY src ./src
RUN npx tsc

# Persistent work dir for in-progress clones; mount a volume here in production.
RUN mkdir -p /var/coop/work
ENV COOP_WORK_ROOT=/var/coop/work

EXPOSE 8787
CMD ["node", "dist/server.js"]
