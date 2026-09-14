FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 5173

# Vite dev server — binds to 0.0.0.0 so Docker can expose it
CMD ["npx", "vite", "--host", "0.0.0.0"]
