# Nutrition Tracker — Frontend Deployment Guide

## Stack
- React 18 + TypeScript + Vite
- Talks to the Node.js backend via `/api` calls
- PWA-ready (installs on iPhone home screen like a native app)

---

## Local Development

```bash
# 1. Install deps
npm install

# 2. Copy env file
cp .env.example .env.local
# Leave VITE_API_URL blank — Vite proxies /api to localhost:3001

# 3. Make sure the backend is running first (port 3001)
# Then start the frontend:
npm run dev
# App at http://localhost:5173
```

---

## Production Build & Deploy (DigitalOcean)

### 1. Set environment variable
```bash
# In .env.production
VITE_API_URL=https://api.yourdomain.com
```

### 2. Build
```bash
npm run build
# Output in ./dist folder
```

### 3. Upload to Droplet
```bash
scp -r dist/ root@YOUR_DROPLET_IP:/var/www/nutrition-app
```

### 4. Nginx config (serve static frontend)
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    root /var/www/nutrition-app;
    index index.html;

    # Required for React Router (client-side routing)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 5. SSL
```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

---

## PWA — Install on iPhone as App Icon

Once deployed to HTTPS:

1. Open the URL in Safari on iPhone
2. Tap the Share button (box with arrow)
3. Tap **Add to Home Screen**
4. Name it "Nutrition" → tap Add

It will appear as an app icon with no browser chrome — looks and feels native.

> Note: You'll need to add icon-192.png and icon-512.png to the /public folder.
> Any square image (the app logo) exported at those sizes works fine.

---

## Project Structure

```
src/
  App.tsx       — full UI (dashboard, food, exercise, meals, history, library)
  api.ts        — all backend API calls (swap window.storage → fetch)
  main.tsx      — React entry point
public/
  manifest.json — PWA config for "Add to Home Screen"
index.html      — sets mobile viewport, PWA meta tags
vite.config.ts  — dev proxy: /api → localhost:3001
```

---

## Key: What Changed from Claude Prototype → This Version

| Claude artifact (window.storage) | This version (API) |
|---|---|
| `window.storage.set(...)` | `api.food.add(...)` |
| `window.storage.get(...)` | `api.food.getByDate(...)` |
| Data stored in Claude session | Data stored in SQLite on your Droplet |
| Single device only | Works on any device, any browser |
| Lost on session end | Persists forever |
