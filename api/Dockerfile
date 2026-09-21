# Development image for the API. Build context: the REPO ROOT (see docker/docker-compose.yml),
# because the API depends on the shared workspace package.
FROM node:20-alpine

WORKDIR /app

# Manifests first, so the dependency layer is reused until they change.
# npm needs every workspace's package.json to exist to read the lockfile.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/

# shared/ sources are needed at install time: the root postinstall builds it.
COPY shared/ shared/

# Only what the API needs; the web app's dependencies stay out of this image.
RUN npm ci -w @nutrition/api -w @nutrition/shared --include-workspace-root

COPY api/ api/

RUN mkdir -p /app/data
ENV DB_PATH=/app/data/nutrition.db

EXPOSE 3001

# Dev: ts-node-dev for hot reload
CMD ["npm", "run", "dev", "-w", "@nutrition/api"]
