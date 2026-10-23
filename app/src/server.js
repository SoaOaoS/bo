import { openDb } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT) || 3000;
const dbFile = process.env.DB_FILE || './data/ballon-dor.sqlite';
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminPassword || adminPassword.length < 8) {
  console.error('ADMIN_PASSWORD doit être défini (8 caractères minimum).');
  process.exit(1);
}

const db = openDb(dbFile);
const app = createApp({
  db,
  adminPassword,
  sessionSecret: process.env.SESSION_SECRET,
  secureCookies: process.env.SECURE_COOKIES === 'true',
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : false,
});

const server = app.listen(port, () => {
  console.log(`Ballon d'Or – vote : http://localhost:${port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
