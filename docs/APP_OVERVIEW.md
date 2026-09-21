# Katarina's Nutrition Tracker

A personalised nutrition and fitness tracking application built specifically for a 50-year-old menopausal woman on HRT, following the Galveston Diet protocol modified for muscle preservation. The app tracks daily food intake, macronutrients (including fibre), exercise calories, and provides meal plan recommendations — all calibrated to her specific physiology, training schedule, and weight loss goal.

---

## Table of Contents

1. [Background & Purpose](#background--purpose)
2. [Who It's For](#who-its-for)
3. [Nutritional Philosophy](#nutritional-philosophy)
4. [What the App Does](#what-the-app-does)
5. [Food Library](#food-library)
6. [Exercise Tracking](#exercise-tracking)
7. [Meal Plans & Recipes](#meal-plans--recipes)
8. [History & Analysis](#history--analysis)
9. [Technical Architecture](#technical-architecture)
10. [Deployment](#deployment)
11. [Future Features](#future-features)

---

## Background & Purpose

This app was designed as a personal alternative to MyFitnessPal — purpose-built rather than generic. Standard calorie tracking apps don't account for the specific metabolic, hormonal, and physiological context of menopause. They apply the same macro targets to a 50-year-old menopausal woman as they do to a 25-year-old athlete, which produces suboptimal results.

The Galveston Diet, developed by Dr. Mary Claire Haver (a board-certified OB/GYN), was specifically designed to address:

- **Hormonal fat redistribution** — oestrogen decline causes fat to shift from hips and thighs to the abdomen
- **Chronic inflammation** — a key driver of menopausal weight gain and symptom severity
- **Insulin resistance** — which increases during menopause and makes carbohydrate management more important
- **Muscle loss (sarcopenia)** — accelerates significantly after menopause without deliberate protein intake and resistance training

This app applies the Galveston framework with one deliberate modification: protein is set higher than the book's baseline to protect muscle mass in someone actively doing strength training.

---

## Who It's For

**User profile:**
- Name: Katarina
- Age: 50
- Weight: 134 lbs (60.8 kg)
- Height: 5'3"
- Menopausal, on HRT
- Activity level: Sedentary baseline (desk job)
- Training: Lagree (Megaformer), 3-day strength split, occasional cardio
- Goal: Lose 10 lbs at 1 lb/week

**Training split:**
- Tuesday — Shoulder press, chest press, triceps (3–4 reps, 5–7 sets)
- Wednesday — Leg press, leg extension, hamstring curl, goblet squats, RDLs (3–4 reps, 5–7 sets)
- Thursday — Lateral pull-down, back row, bicep curls (3–4 reps, 5–7 sets)

Sessions are 15–30 minutes. Low-rep, high-set strength training is a deliberate and research-backed approach for muscle preservation during menopause — the calorie burn per session is modest, but the hormonal and metabolic benefit is significant and extends well beyond the workout itself.

---

## Nutritional Philosophy

### Daily Targets

| Macro | Target | Rationale |
|---|---|---|
| Calories | 1,200 net | Safe minimum floor for a menopausal woman; exercise calories are added back |
| Protein | 80g | 1.3g/kg body weight — muscle preservation range per current research |
| Net Carbs | 25g | Galveston anti-inflammatory protocol; calculated as total carbs minus fibre |
| Fat | 80g | Galveston fat-fuelled approach; emphasis on anti-inflammatory healthy fats |
| Fibre | 30g | Supports gut health, hormone metabolism, and satiety during menopause |

### Net Carbs vs Total Carbs

The app tracks **net carbs** (total carbohydrates minus fibre), not total carbohydrates. This is consistent with the Galveston protocol. Fibre does not spike blood sugar or insulin, so it is subtracted from the carb count. This means a food can have 20g of total carbs but only 6g of net carbs if it contains 14g of fibre — such as the Natura Fibre supplement used by this user.

### Why These Numbers Are Not Standard Galveston

The original Galveston book prescribes a 70/20/10 ratio (fat/protein/carbs), which at 1,200 calories produces approximately 93g fat, 60g protein, and 30g net carbs. This app uses a modified version for two reasons:

1. **60g protein is insufficient** for someone doing active resistance training during menopause. Current research on menopausal muscle preservation consistently recommends 1.2–1.6g/kg, which for this user is 73–97g.
2. **Dr. Haver's own more recent public guidance** has moved toward higher protein than the original book specified.

The modification (80g protein, 80g fat, 25g net carbs) keeps the anti-inflammatory fat emphasis while providing adequate protein for the training being done.

### Exercise Calories

Exercise calories are added back to the daily budget — identical to how MyFitnessPal operates. The base target of 1,200 calories is the net goal after exercise. On a Lagree day (approx. 293 calories burned), the effective eating budget becomes 1,493 calories. This approach prevents excessive under-eating on training days, which would accelerate muscle loss — the opposite of what the training is meant to achieve.

---

## What the App Does

### Today Tab (Dashboard)
The home screen for daily use. Shows:

- **Calorie ring** — a circular progress indicator showing net calories consumed vs. the 1,200 goal. Turns red if over.
- **Summary bar** — Goal / Food / Exercise / Remaining in a single row at the top
- **Macro progress bars** — four bars tracking Protein, Net Carbs, Fat, and Fibre against daily targets
- **Net carbs note** — transparent calculation showing total carbs minus fibre equals net carbs
- **Meal breakdown** — food entries grouped by Breakfast, Lunch, Dinner, and Snacks with per-item macros
- **Exercise log** — exercise entries with calories burned shown in accent colour
- **Delete entries** — tap × on any food or exercise item to remove it

### Food Tab
Add foods to the daily log:

- Select the meal slot (Breakfast, Lunch, Dinner, Snacks)
- Search the food library by name
- Select a food to see its per-serving nutritional information
- Adjust the serving amount — macros update in real time
- Tap "Add to [Meal]" — saved to the database immediately

### Exercise Tab
Log workout sessions:

- Select from 20 activities including Lagree, all three named strength splits, cardio options, yoga, and more
- Enter duration in minutes — the app calculates estimated calorie burn
- Exercise burn is based on MET-equivalent estimates adjusted for this user's body weight
- An "Other" option allows manual calorie entry for activities not in the list

### Meals Tab
Pre-built Galveston-aligned meal plans:

- 12 recipes across Breakfast, Lunch, Dinner, and Snacks
- Each recipe shows full macro breakdown before logging
- Filter by meal type
- One tap logs all ingredients at once to the selected meal
- Recipes are designed around anti-inflammatory principles and sushi preferences

### History Tab
Review past days:

- Horizontally scrollable date chips for the past 30 days
- Select any date to load that day's data
- Bar chart analysis showing actual vs. target for all five metrics (calories, protein, net carbs, fat, fibre)
- Each bar shows percentage of target and a status label (on target / under / over)
- Full food and exercise log for the selected day

### Library Tab
Browse the complete food database:

- Search 121 foods
- Each card shows full nutritional information per default serving
- Macro chips: Protein / Net Carbs / Fat / Fibre
- One-tap "Add to Log" button that opens the Food tab with that item pre-selected

---

## Food Library

121 foods across 12 categories, all with complete fibre values for accurate net carb calculation:

| Category | Notable Items |
|---|---|
| Protein | Chicken, salmon, tuna, turkey, shrimp, beef, pork, duck, lamb, all major fish, egg whites, whey protein, Premier Protein shake |
| Fish (extended) | Cod, halibut, tilapia, trout, mackerel, sardines, smoked salmon, crab, scallops, mussels, oysters |
| Dairy | Greek yogurt, cottage cheese, cheddar, mozzarella, string cheese, Babybel |
| Vegetables | 18 vegetables including avocado, broccoli, spinach, kale, asparagus, Brussels sprouts, cauliflower, artichoke, arugula |
| Fruit | Apple, banana, blueberries, strawberries, orange, grapes, mango |
| Grains | Oatmeal, brown rice, quinoa, whole wheat bread, pasta, English muffin, bagel |
| Legumes | Black beans, lentils, hummus, edamame |
| Fats | Olive oil, almonds, walnuts, peanut butter, butter, chia seeds, mixed nuts, cashews, pumpkin seeds, sunflower seeds |
| Snacks | Rice cakes, popcorn, protein bars, hard boiled eggs, dates |
| Breakfast | Scrambled eggs, overnight oats, granola, smoothie, acai bowl, bran cereal, almond milk |
| Sushi | Avocado roll, tuna nigiri, sockeye salmon nigiri, tuna sashimi, sockeye salmon sashimi, miso soup, ponzu sauce |
| Supplements | Natura Fibre by Brightside Organics (14g fibre per 30g serving) |
| Other | Hollandaise sauce, Canadian bacon, dark chocolate, coffee |

All sushi items are logged per piece (nigiri, sashimi) or per roll, allowing precise logging of typical restaurant orders.

---

## Exercise Library

20 activities with calorie-per-minute estimates calibrated to this user's body weight (134 lbs):

| Activity | Cal/min | Notes |
|---|---|---|
| Lagree (Megaformer) | 6.5 | ~293 cal for a 45-min session |
| Strength: Upper Push (Tue) | 3.8 | Shoulders, chest, triceps |
| Strength: Legs (Wed) | 4.5 | Press, squats, RDLs, curls |
| Strength: Upper Pull (Thu) | 3.8 | Back, biceps |
| Running (6+ mph) | 10 | |
| HIIT | 9 | |
| Swimming | 7 | |
| Rowing Machine | 7.5 | |
| Cycling (vigorous) | 10 | |
| Walking (brisk) | 4.5 | |
| Yoga | 2.8 | |
| Barre | 4 | |

The three named strength splits are specifically calibrated for low-rep, high-set training. They burn fewer calories per minute than high-rep work due to the longer rest periods inherent to this training style — but the metabolic and hormonal effects persist for hours after the session.

---

## Meal Plans & Recipes

12 Galveston-aligned recipes across all meal slots:

### Breakfasts
| Recipe | Badge | Key Feature |
|---|---|---|
| Lagree Morning | Workout Day | Premier Protein + egg + coffee. 2 minutes, no cooking. |
| Smoked Salmon Plate | Galveston | Near-zero net carbs, high omega-3, anti-inflammatory |
| Greek Protein Bowl | High Fibre | Yogurt + blueberries + chia + Natura Fibre |
| Weekend Eggs Benedict | Weekend Treat | English muffin + eggs + cheese + hollandaise |

### Lunches
| Recipe | Badge | Key Feature |
|---|---|---|
| Salmon Avocado Bowl | Galveston | The ideal Galveston lunch — omega-3 + healthy fat |
| Tuna Avocado Bowl | Low Carb | Very low net carbs for high-carb breakfast days |
| Sushi Favourite | Sushi Day | Typical order: tuna + salmon nigiri, sashimi, miso, ponzu |

### Dinners
| Recipe | Badge | Key Feature |
|---|---|---|
| Chicken & Greens | Galveston | Simple, high protein, olive oil |
| Salmon & Roasted Veg | Anti-Inflammatory | Cruciferous veg + fatty fish for hormonal balance |
| Sirloin & Brussels | Strength Day | Higher protein for post-lifting recovery |

### Snacks
| Recipe | Badge | Key Feature |
|---|---|---|
| Afternoon Snack | Quick | Almonds + string cheese — no blood sugar spike |
| Fibre Boost Bowl | High Fibre | Natura Fibre + yogurt + strawberries — hits fibre target |

---

## Technical Architecture

### Prototype (Claude.ai Artifact)
The original version was a self-contained React artifact running inside Claude.ai, using Claude's built-in persistent storage API (`window.storage`) for data persistence. This version is suitable for personal daily use but is limited to a single device and cannot be installed as a standalone app.

### Production Version

```
┌─────────────────────────────────────┐
│           iPhone / Browser           │
│   React + TypeScript + Vite (PWA)   │
│         nutrition-frontend           │
└──────────────┬──────────────────────┘
               │ HTTPS API calls
               │ /api/food, /api/exercise, /api/summary
               ▼
┌─────────────────────────────────────┐
│         DigitalOcean Droplet         │
│   Node.js + TypeScript + Express    │
│         nutrition-backend            │
│                                     │
│   ┌─────────────────────────────┐   │
│   │      SQLite Database        │   │
│   │   /data/nutrition.db        │   │
│   │                             │   │
│   │  • food_logs                │   │
│   │  • exercise_logs            │   │
│   │  • weight_logs              │   │
│   │  • users                    │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Backend (nutrition-backend)
- **Runtime:** Node.js with TypeScript
- **Framework:** Express.js
- **Database:** SQLite via `better-sqlite3`
- **Security:** Helmet.js headers, CORS restricted to known origins
- **Logging:** Morgan request logging
- **Process management:** PM2 (keeps server alive, auto-restarts on reboot)

**API endpoints:**

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Server health check |
| GET | `/api/food/:date` | Fetch food log for a date |
| POST | `/api/food` | Add a food entry |
| POST | `/api/food/batch` | Add multiple entries (recipe logging) |
| DELETE | `/api/food/:id` | Remove a food entry |
| GET | `/api/exercise/:date` | Fetch exercise log for a date |
| POST | `/api/exercise` | Add an exercise entry |
| DELETE | `/api/exercise/:id` | Remove an exercise entry |
| GET | `/api/summary/day/:date` | Full nutrition summary for a day |
| GET | `/api/summary/range` | Summary across a date range |
| POST | `/api/summary/weight` | Log a weight entry |
| GET | `/api/summary/weight` | Fetch weight history |

### Frontend (nutrition-frontend)
- **Framework:** React 18 with TypeScript
- **Build tool:** Vite
- **API layer:** Custom typed API client (`src/api.ts`)
- **PWA:** Web App Manifest + mobile meta tags for Add to Home Screen
- **Styling:** Inline styles with a consistent design token system

### Database Schema

```sql
users         — id, name, email, created_at
food_logs     — id, user_id, date, meal, food_name, amount,
                cal, protein, carbs, fat, fiber, created_at
exercise_logs — id, user_id, date, name, duration, cal, created_at
weight_logs   — id, user_id, date, weight_lbs, notes, created_at
```

All tables include a `user_id` foreign key, making the schema ready for multi-user support without structural changes.

---

## Deployment

### Prerequisites
- Existing DigitalOcean Droplet with Node.js and Nginx installed
- Domain name with DNS pointed at the Droplet
- PM2 installed globally (`npm install -g pm2`)
- Certbot for SSL

### Backend Deployment
```bash
# Upload
scp -r nutrition-api/ root@YOUR_IP:/var/www/nutrition-backend

# On the Droplet
cd /var/www/nutrition-backend
npm install
npm run build

# Create .env
echo "PORT=3001" > .env
echo "FRONTEND_URL=https://yourdomain.com" >> .env

# Start with PM2
pm2 start dist/index.js --name nutrition-api
pm2 save && pm2 startup
```

### Frontend Deployment
```bash
# Set production API URL
echo "VITE_API_URL=https://api.yourdomain.com" > .env.production

# Build
npm install && npm run build

# Upload dist folder
scp -r dist/ root@YOUR_IP:/var/www/nutrition-app
```

### Installing on iPhone
Once deployed to HTTPS, open in Safari → Share → Add to Home Screen. The app will appear as a standalone icon with no browser chrome, behaving identically to a native app.

---

## Future Features

The following features were discussed during development and are logical next steps:

### Weight Tracking Dashboard
The backend already has a `weight_logs` table and API endpoints built. The remaining work is a frontend UI — a weight log form and a line chart showing progress toward the 10 lb goal over time. With 30 days of data this becomes a genuinely useful trend view.

### Weekly Summary & Insights
A weekly roll-up screen showing average daily intake for each macro, best and worst days by adherence, and a simple score or streak. This could include a note like "You hit your protein target 5 out of 7 days this week" or flag patterns like consistently going over on net carbs at dinner.

### Custom Food Entry
A form to add foods not in the 121-item library — name, serving size, and all five macro values. Saved to a user-specific custom food table in the database. This was a common gap identified during use (e.g. packaged products, restaurant items).

### Barcode Scanner
Scan a packaged food's barcode to look up nutritional information automatically via a public food database API (Open Food Facts is free and extensive). This is the single highest-impact usability improvement for daily real-world use.

### Recipe Builder
A tool to input a recipe's ingredients and serving count, which calculates per-serving macros and saves the result as a custom meal plan entry. Useful for home-cooked meals that are eaten repeatedly.

### Mobile App (React Native)
The web app installed as a PWA is close to native, but a true React Native app would unlock native device features — specifically the camera (for barcode scanning) and push notifications. The backend API is already built and would require no changes. The frontend would be ported from React to React Native, which shares the same component logic but uses native UI primitives instead of HTML elements.

### Push Notifications / Reminders
Daily reminders to log meals, a mid-afternoon nudge to check fibre intake, and a Lagree day reminder to eat back exercise calories. Requires either a React Native app or a service worker in the PWA.

### HRT & Symptom Log
A simple daily log for tracking menopause symptoms alongside nutrition — energy levels, sleep quality, mood, bloating. Useful for identifying correlations between diet and symptom patterns over time. The Galveston Diet specifically targets symptom reduction through dietary inflammation management, so this data would be directly relevant.

### Inflammation Score
Each food in the library could be tagged with an inflammation index rating (pro-inflammatory vs anti-inflammatory). A daily inflammation score would give an additional dimension of feedback beyond macros — directly aligned with the Galveston protocol's core principle that chronic inflammation drives menopausal weight gain.

### Apple Health / Google Fit Integration
Import exercise data automatically from the health platform rather than logging manually. Step counts and active calories from the watch or phone could be pulled in to give a more accurate picture of total daily energy expenditure.

### Multi-User Support
The database schema already includes `user_id` on all tables. Adding authentication (a simple JWT-based login) and a user registration flow would make this deployable as a shared app for multiple people — whether family members or, eventually, other women following the Galveston protocol.

### Dietitian Export
A PDF or CSV export of a date range's data — food logs, macro averages, weight trend — formatted for sharing with a registered dietitian or physician. Useful for monitoring appointments, particularly given the HRT context where dietary choices interact with medication.

---

## Design Notes

The app uses a warm, natural colour palette chosen to feel like a wellness tool rather than a clinical tracker:

| Token | Hex | Used for |
|---|---|---|
| Primary | `#3D5A4C` | Header, buttons, calorie ring |
| Accent | `#C4714A` | Exercise calories, log button |
| Gold | `#C9963A` | Net carbs bar |
| Fat green | `#5E9478` | Fat macro bar |
| Fibre purple | `#7B6BB0` | Fibre macro bar |
| Background | `#F8F5F0` | App background (warm off-white) |

Typography uses DM Serif Display for headings (editorial warmth) and DM Sans for body text (clean readability at small sizes).

---

## About This Project

This application was built conversationally with Claude (Anthropic) across a single session, starting from a description of the user's health context and goals, and iterating through food library expansion, macro recalibration, exercise personalisation, history tracking, meal planning, and full-stack productionisation. No coding was done by the end user. The final deliverable is a production-ready, deployable web application with a typed TypeScript backend and a PWA-capable React frontend.
