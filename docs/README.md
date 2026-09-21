# Katarina's Nutrition Tracker
### Full-Stack Web Application — Project Handoff Package

---

## What Is This?

A personalised nutrition and fitness tracking web application, built as a Progressive Web App (PWA) that installs on iPhone like a native app. It is the digital equivalent of MyFitnessPal, but purpose-built for one specific user — a 50-year-old menopausal woman on HRT following the Galveston Diet protocol, modified for muscle preservation through active strength training.

It is not a generic app. Every number, every food, every exercise, and every design decision is specific to this user's physiology, training schedule, and goals.

---

## What's In This Package

```
project-bundle/
├── backend/              Node.js + TypeScript + Express + SQLite API
├── frontend/             React 18 + TypeScript + Vite PWA
├── docker/
│   └── docker-compose.yml  Local development stack
└── docs/
    ├── README.md               This file
    ├── IMPLEMENTATION_GUIDE.md Full developer setup + architecture guide
    ├── DESIGN_STYLE_GUIDE.md   Visual design system reference
    └── API_SPEC.md             Complete REST API documentation
```

---

## Quick Start

```bash
# Backend (Terminal 1)
cd backend && npm install && cp .env.example .env && npm run dev

# Frontend (Terminal 2)
cd frontend && npm install && cp .env.example .env.local && npm run dev

# Open http://localhost:5173
```

Or with Docker:
```bash
cd docker && docker compose up
```

Full setup instructions: see `docs/IMPLEMENTATION_GUIDE.md`

---

## The User

| | |
|---|---|
| Name | Katarina |
| Age | 50 |
| Weight | 134 lbs (60.8 kg) |
| Height | 5'3" |
| Status | Menopausal, on HRT |
| Goal | Lose 10 lbs at 1 lb/week |
| Training | Lagree + 3-day strength split (Tue/Wed/Thu), 15–30 min sessions |
| Diet | Galveston Diet, modified for muscle preservation |

---

## Daily Nutritional Targets

| Macro | Target | Why |
|---|---|---|
| Calories | 1,200 net | Safe minimum floor for menopausal women |
| Protein | 80g | 1.3g/kg — muscle preservation during menopause |
| Net Carbs | 25g | Galveston anti-inflammatory protocol |
| Fat | 80g | Galveston fat-fuelled energy approach |
| Fibre | 30g | Gut health, hormone metabolism, satiety |

Net carbs = total carbs − fibre. Exercise calories are added back to the daily budget.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js, TypeScript, Express |
| Database | SQLite (via `better-sqlite3`) |
| Hosting | DigitalOcean Droplet (existing) |
| Process manager | PM2 |
| Web server | Nginx |
| SSL | Certbot / Let's Encrypt |
| Mobile install | PWA (Add to Home Screen via Safari) |

---

## Features

### Today (Dashboard)
- Calorie ring showing net calories vs. 1,200 goal
- Four macro bars: Protein / Net Carbs / Fat / Fibre
- Summary header: Goal / Food / Exercise / Remaining
- Meal-grouped food log with per-item delete
- Exercise log with calorie burn

### Food Tab
- Search 121 foods across 12 categories
- Serving size adjustment with live macro calculation
- Add to any meal slot

### Exercise Tab
- 20 activities including Lagree and named strength splits
- Estimated calorie burn from duration
- Manual calorie entry option

### Meals Tab
- 12 pre-built Galveston-aligned recipes
- Filter by meal type
- One-tap log all ingredients at once
- Macro preview before logging

### History Tab
- Past 30 days as scrollable date chips
- Bar chart analysis vs. targets for all 5 metrics
- Full food and exercise log for any past date

### Library Tab
- Browse all 121 foods
- Full macro breakdown per food
- One-tap add to log

---

## What Still Needs To Be Done Before Launch

- [ ] Add app icons: `icon-192.png` and `icon-512.png` to `frontend/public/`
- [ ] Set production domain in `backend/.env` (`FRONTEND_URL`)
- [ ] Set API URL in `frontend/.env.production` (`VITE_API_URL`)
- [ ] Configure Nginx for both frontend and API domains
- [ ] Issue SSL certificates via Certbot
- [ ] Start backend with PM2 and save process list
- [ ] Set up daily database backup cron job
- [ ] Test PWA Add to Home Screen on iPhone Safari

---

## Planned Future Features

| Feature | Priority | Notes |
|---|---|---|
| Weight tracking UI | High | Backend + DB already built — frontend only |
| Weekly summary & insights | High | Roll-up averages, adherence streaks |
| Custom food entry | High | Add foods not in the library |
| Barcode scanner | Medium | Open Food Facts API integration |
| Recipe builder | Medium | Input ingredients → calculate per-serving macros |
| React Native mobile app | Medium | Backend unchanged — port frontend only |
| Push notifications | Medium | Requires native app or service worker |
| HRT & symptom log | Medium | Mood, sleep, energy alongside nutrition |
| Inflammation score | Low | Tag foods as pro/anti-inflammatory |
| Apple Health integration | Low | Import exercise data automatically |
| Multi-user authentication | Low | Schema ready — add JWT middleware |
| Dietitian export (PDF/CSV) | Low | Date-range export for medical appointments |

---

## Document Index

| Document | Purpose |
|---|---|
| `docs/IMPLEMENTATION_GUIDE.md` | Developer setup, architecture decisions, deployment instructions, known limitations |
| `docs/DESIGN_STYLE_GUIDE.md` | Colour palette, typography, spacing, component specs, interaction patterns |
| `docs/API_SPEC.md` | Every endpoint with request/response examples, field descriptions, error codes |
| `backend/src/db/migrations/` | Numbered SQL migrations: schema, indexes, views. Applied once each on startup |
| `backend/README.md` | Backend-specific quick start and deployment |
| `frontend/README.md` | Frontend-specific quick start, PWA install, deployment |

---

## Built With

This application was designed and built conversationally with Claude (Anthropic) — no code was written by the end user. The project began as a description of a health goal and evolved through natural conversation into a production-ready, deployable full-stack application with a typed TypeScript backend, React PWA frontend, SQLite database, and complete documentation.
