import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDatabase, DEFAULT_DB_PATH } from "./db";

// Config first: a missing production secret should stop the process before it
// touches the database.
const config = loadConfig();
const PORT = process.env.PORT || 3001;

const db = openDatabase(DEFAULT_DB_PATH);
console.log(`✅ Database ready at ${DEFAULT_DB_PATH}`);

const app = createApp(db, { config });

app.listen(PORT, () => {
  console.log(`🥗 Nutrition API running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  if (!config.mail.resendApiKey) console.log("   Email: RESEND_API_KEY not set, so messages are printed here instead of sent");
});
