# Development image for the web app. Build context: the REPO ROOT.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
COPY shared/ shared/

RUN npm ci -w @nutrition/web -w @nutrition/shared --include-workspace-root

COPY web/ web/

EXPOSE 5173

# Vite dev server — binds to 0.0.0.0 so Docker can expose it
CMD ["npm", "run", "dev", "-w", "@nutrition/web", "--", "--host", "0.0.0.0"]
