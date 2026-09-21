import { createApp } from "./app";
import { openDatabase, DEFAULT_DB_PATH } from "./db";

const PORT = process.env.PORT || 3001;

const db = openDatabase(DEFAULT_DB_PATH);
console.log(`✅ Database ready at ${DEFAULT_DB_PATH}`);

const app = createApp(db);

app.listen(PORT, () => {
  console.log(`🥗 Nutrition API running on port ${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
});
