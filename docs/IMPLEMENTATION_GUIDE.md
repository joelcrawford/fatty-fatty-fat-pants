# Implementation Guide
## Katarina's Nutrition Tracker — Developer Reference

This guide is written for the development team responsible for building, deploying, and maintaining this application. It covers architecture decisions, local setup, environment configuration, deployment, and known constraints.

---

## 1. Project Overview

A full-stack nutrition and fitness tracking web application, designed as a personal tool for a single user following the Galveston Diet protocol during menopause. Built to work as a Progressive Web App (PWA) installable on iPhone, backed by a persistent database on DigitalOcean.

**Phase 1 (this deliverable):** Web app, single user, SQLite database
**Phase 2 (planned):** React Native mobile app — backend unchanged
**Phase 3 (future):** Multi-user support — database schema already prepared

---

## 2. Repository Structure

```
nutrition-tracker/
├── backend/                  Node.js + TypeScript + Express + SQLite
│   ├── src/
│   │   ├── index.ts          Express server entry point
│   │   ├── types.ts          Shared TypeScript interfaces
│   │   ├── db/
│   │   │   ├── index.ts      SQLite connection; runs schema.sql on start
│   │   │   └── schema.sql    Single source of truth for the schema + views
│   │   └── routes/
│   │       ├── food.ts       /api/food endpoints
│   │       ├── exercise.ts   /api/exercise endpoints
│   │       └── summary.ts    /api/summary + /api/summary/weight
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── .gitignore
│
├── frontend/                 React 18 + TypeScript + Vite
│   ├── src/
│   │   ├── App.tsx           Full application (all tabs and UI)
│   │   ├── api.ts            Typed API client (all backend calls)
│   │   └── main.tsx          React DOM entry point
│   ├── public/
│   │   └── manifest.json     PWA manifest (Add to Home Screen)
│   ├── index.html            HTML shell with PWA meta tags
│   ├── Dockerfile
│   ├── vite.config.ts        Dev proxy: /api → localhost:3001
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── .gitignore
│
├── docker/
│   └── docker-compose.yml    Local dev stack
│
├── docs/
│   ├── README.md             Project overview + feature docs
│   ├── IMPLEMENTATION_GUIDE.md  (this file)
│   ├── DESIGN_STYLE_GUIDE.md
│   └── API_SPEC.md
```

---

## 3. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20.x LTS | Backend and frontend both require this |
| npm | 10.x | Bundled with Node 20 |
| Docker | 24+ | Optional — for containerised local dev |
| Git | Any | |

For deployment:
- DigitalOcean Droplet (existing) with Ubuntu 22.04
- Nginx installed
- PM2 installed globally (`npm install -g pm2`)
- Certbot for SSL

---

## 4. Local Development Setup

### Option A — Without Docker (recommended for active development)

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
npm run dev
# API running at http://localhost:3001
# SQLite database auto-created at ./data/nutrition.db on first run
```

**Frontend (separate terminal):**
```bash
cd frontend
npm install
cp .env.example .env.local
# Leave VITE_API_URL blank — Vite proxies /api → localhost:3001
npm run dev
# App running at http://localhost:5173
```

### Option B — With Docker

```bash
cd docker          # compose must be run from this directory
docker compose up
# Frontend: http://localhost:5173
# Backend:  http://localhost:3001
# SQLite persisted in Docker volume: nutrition-db
```

### Verify it's working
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"..."}
```

---

## 5. Environment Variables

### Backend (.env)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | Port the Express server listens on |
| `FRONTEND_URL` | Yes (prod) | — | Frontend origin for CORS whitelist |
| `NODE_ENV` | No | `development` | Affects logging verbosity |

### Frontend (.env.local / .env.production)

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_API_URL` | No (dev) | `""` | Backend base URL. Empty string = use Vite proxy. Set to full URL in production e.g. `https://api.yourdomain.com` |

In production, Vite bakes `VITE_API_URL` into the built JS bundle at build time. Always run `npm run build` after changing it.

---

## 6. Architecture Decisions

### Why SQLite and not PostgreSQL?
SQLite is appropriate for a single-user application with no concurrent write requirements. It requires zero server infrastructure — the database is a single file (`nutrition.db`) that lives alongside the Node.js process. The schema is written to be PostgreSQL-compatible if migration becomes necessary (multi-user, higher traffic).

To migrate to PostgreSQL later: replace `better-sqlite3` with `pg`, update connection syntax, and run `backend/src/db/schema.sql` against a Postgres instance.

### Why a monolith frontend (one App.tsx)?
At ~800 lines, the component is large but manageable for a solo-developer or small team. It was built this way for speed and simplicity. If the codebase grows, refactor into:
```
src/
  components/
    Dashboard.tsx
    FoodTab.tsx
    ExerciseTab.tsx
    MealsTab.tsx
    HistoryTab.tsx
    LibraryTab.tsx
    MacroBar.tsx
    BarAnalysis.tsx
  hooks/
    useFood.ts
    useExercise.ts
  data/
    foodLibrary.ts
    exerciseLibrary.ts
    mealPlans.ts
```

### Why inline styles and not Tailwind or CSS modules?
The prototype was built as a Claude artifact with no build tooling. Inline styles were carried forward for consistency. For production, converting to CSS modules or Tailwind is recommended — the design token system (the `C` object in App.tsx) maps directly to CSS custom properties.

### Why no authentication?
Single-user v1. The database schema includes `user_id` on all tables ready for multi-user support. Authentication can be added with a standard JWT middleware layer without changing the schema.

### Why is the food library hardcoded in the frontend?
The 121-item library is static data that doesn't change frequently. It was bundled into the frontend for simplicity and instant search performance with no network round-trip. When the custom food entry feature is built (future), it will query the `custom_foods` table via the API, and the two sources can be merged in the UI.

---

## 7. Adding New Food Items

Currently done in `src/App.tsx` in the `FOOD_LIBRARY` array. Each item follows this shape:

```typescript
{
  id: number,          // Sequential, must be unique
  name: string,        // Display name
  cal: number,         // Per defaultServing
  protein: number,     // grams per defaultServing
  carbs: number,       // grams per defaultServing (total, not net)
  fat: number,         // grams per defaultServing
  fiber: number,       // grams per defaultServing (critical for net carb calc)
  unit: string,        // "g" | "ml" | "cup" | "piece" | etc.
  defaultServing: number, // The quantity the macros are based on
  category: string,    // Display grouping
}
```

Fiber must always be filled in — even if zero. Leaving it undefined breaks net carb calculation.

---

## 8. Adding New Exercise Types

In `src/App.tsx`, add to the `EXERCISE_LIBRARY` array:

```typescript
{ name: "Your Activity Name", calPerMin: X }
```

`calPerMin` is calibrated for this user's body weight (134 lbs / 60.8 kg). To calculate for a new activity, use the MET formula:
```
cal/min = (MET × 3.5 × bodyWeightKg) / 200
```

Common METs: walking 3.5, cycling 8, swimming 8, yoga 3, weight training 5, Lagree ~7.5.

---

## 9. Calorie and Macro Calculation Logic

Net calories (shown in the ring):
```
netCal = totalFoodCalories - totalExerciseCalories
```

Net carbs (shown in macro bars):
```
netCarbs = max(0, totalCarbs - totalFiber)
```

Remaining calories:
```
remaining = DAILY_CAL - netCal   // 1200 - netCal
```

When an exercise is logged, it effectively increases the eating budget for that day — consistent with how MyFitnessPal operates.

---

## 10. Daily Targets

Defined as constants at the top of `App.tsx` and also in `API_SPEC.md`. These should match in both places.

```typescript
const DAILY_CAL = 1200;
const PROTEIN_TARGET = 80;   // grams
const CARBS_TARGET = 25;     // grams net
const FAT_TARGET = 80;       // grams
const FIBER_TARGET = 30;     // grams
```

These are personalised for Katarina's profile. Any change should be reflected in both `App.tsx` and the backend `summary.ts` if a target-adherence check is ever added server-side.

---

## 11. PWA Configuration

The app is configured for installation as a PWA via:

- `index.html` — mobile viewport, apple-mobile-web-app meta tags
- `public/manifest.json` — PWA name, icons, display mode
- Theme colour `#3D5A4C` matches the app's primary green

**Required before launch:** Two app icon files must be placed in `/frontend/public/`:
- `icon-192.png` — 192×192 pixels, square, transparent or coloured background
- `icon-512.png` — 512×512 pixels, same design

Any square image works. The primary green (`#3D5A4C`) as background with a white icon reads well.

**To install on iPhone:** Open the deployed URL in Safari → Share → Add to Home Screen.

---

## 12. Deployment (DigitalOcean)

### Backend

```bash
# On the Droplet
cd /var/www
git clone <repo> nutrition-tracker
cd nutrition-tracker/backend
npm install
npm run build

cat > .env << EOF
PORT=3001
FRONTEND_URL=https://yourdomain.com
NODE_ENV=production
EOF

pm2 start dist/index.js --name nutrition-api
pm2 save && pm2 startup
```

**Nginx config for API:**
```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Frontend

```bash
cd nutrition-tracker/frontend
echo "VITE_API_URL=https://api.yourdomain.com" > .env.production
npm install && npm run build
# dist/ folder is the deployable output
```

**Nginx config for frontend:**
```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    root /var/www/nutrition-tracker/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|ico|svg|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

```bash
certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

---

## 13. Database Backup

```bash
# Manual backup
cp /var/www/nutrition-tracker/backend/data/nutrition.db \
   /var/backups/nutrition-$(date +%Y%m%d).db

# Cron backup (daily at 2am)
0 2 * * * cp /var/www/nutrition-tracker/backend/data/nutrition.db \
             /var/backups/nutrition-$(date +\%Y\%m\%d).db
```

SQLite databases in WAL mode are safe to copy while the server is running.

---

## 14. Testing Checklist (Pre-Launch)

- [ ] Health endpoint returns 200: `GET /health`
- [ ] Add a food item and verify it persists on page reload
- [ ] Delete a food item and verify it disappears
- [ ] Log exercise and verify calorie ring updates
- [ ] Log a recipe from Meals tab and verify all ingredients appear in Today
- [ ] Navigate to History tab and verify today appears
- [ ] Verify macro bars update when food is added
- [ ] Verify net carbs = total carbs - fibre (check with Natura Fibre scoop)
- [ ] Open on iPhone Safari and verify Add to Home Screen works
- [ ] Verify app opens full screen (no browser chrome) after installation
- [ ] Check API error banner appears when backend is unreachable

---

## 15. Known Limitations (v1)

- No authentication — the app is open to anyone with the URL
- Food library is static — editing requires a code change and redeploy
- No barcode scanner — manual food search only
- History date chips show dates with food logged; gaps are normal
- Exercise calorie estimates are approximations based on MET values, not a heart rate monitor
- PWA on iOS does not support push notifications (Apple limitation)
