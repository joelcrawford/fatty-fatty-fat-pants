# Nutrition Tracker API — Deployment Guide for Joel

## Stack
- Node.js + TypeScript + Express
- SQLite via `better-sqlite3`
- Runs on existing DigitalOcean Droplet

---

## Local Development

```bash
npm install
npm run dev
# API running at http://localhost:3001
# Health check: GET http://localhost:3001/health
```

---

## DigitalOcean Deployment

### 1. Upload to Droplet
```bash
# From your machine
scp -r nutrition-backend/ root@YOUR_DROPLET_IP:/var/www/nutrition-backend
```

### 2. Install dependencies & build
```bash
ssh root@YOUR_DROPLET_IP
cd /var/www/nutrition-backend
npm install
npm run build
```

### 3. Set environment variables
```bash
# Create .env file
cat > .env << EOF
PORT=3001
FRONTEND_URL=https://your-frontend-domain.com
EOF
```

### 4. Run with PM2 (keeps it alive on reboot)
```bash
npm install -g pm2
pm2 start dist/index.js --name nutrition-api
pm2 save
pm2 startup   # follow the printed command to enable on reboot
```

### 5. Nginx reverse proxy (add to your existing nginx config)
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 6. SSL with Certbot
```bash
certbot --nginx -d api.yourdomain.com
```

---

## API Endpoints

### Food Log
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/food/:date` | Get food entries for a date (YYYY-MM-DD) |
| POST | `/api/food` | Add a single food entry |
| POST | `/api/food/batch` | Add multiple entries at once (recipe logging) |
| DELETE | `/api/food/:id` | Remove an entry |

### Exercise Log
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/exercise/:date` | Get exercise entries for a date |
| POST | `/api/exercise` | Add an exercise entry |
| DELETE | `/api/exercise/:id` | Remove an entry |

### Summary & Weight
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/summary/day/:date` | Full nutrition summary for a day |
| GET | `/api/summary/range?start=&end=` | Summary across a date range (history) |
| POST | `/api/summary/weight` | Log a weight entry |
| GET | `/api/summary/weight?days=30` | Get recent weight entries |

---

## Frontend Integration (React)

Replace `window.storage` calls in the React app with these fetch calls:

```typescript
const API = "https://api.yourdomain.com";

// Load today's food log
const res = await fetch(`${API}/api/food/2026-04-26`);
const { data } = await res.json();

// Add a food entry
await fetch(`${API}/api/food`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    date: "2026-04-26",
    meal: "Breakfast",
    food_name: "Premier Protein Shake – Chocolate",
    amount: "1 bottle",
    cal: 160, protein: 30, carbs: 5, fat: 3, fiber: 3
  })
});

// Delete an entry
await fetch(`${API}/api/food/42`, { method: "DELETE" });
```

---

## Database
- SQLite file stored at `./data/nutrition.db`
- Auto-created on first run — no manual migration needed
- Tables: `users`, `food_logs`, `exercise_logs`, `weight_logs`
- Back up with: `cp data/nutrition.db data/nutrition.db.backup`

## Future: Upgrade to PostgreSQL
When ready to scale or add multi-user support, the query syntax is nearly identical.
Just swap `better-sqlite3` for `pg` and update the connection string.
