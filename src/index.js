'use strict';

const fs = require('fs');
const path = require('path');
const createApp = require('./app');
const config = require('./config');
const { pool, init } = require('./db');

const ADMIN_PASSWORD_ENV_HINT =
  'admin password is still the default "change-me". Set ADMIN_PASSWORD in .env before going live.';

async function main() {
  await init();

  if (config.adminPassword === 'change-me') {
    console.warn('[warn] ' + ADMIN_PASSWORD_ENV_HINT);
  }
  if (config.sessionSecret.startsWith('dev-insecure')) {
    console.warn('[warn] SESSION_SECRET is the dev default. Generate one with: openssl rand -hex 32');
  }

  const app = createApp(pool);
  app.listen(config.port, () => {
    console.log(`[${config.shopName}] webshop listening on http://0.0.0.0:${config.port}`);
    console.log(`  admin panel: /admin  (user: ${config.adminUser})`);
  });

  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      await pool.end();
      process.exit(0);
    });
  }
}

// Allow `node src/db.js --init` to run schema standalone.
if (process.argv[1] && process.argv[1].endsWith('db.js') && process.argv.includes('--init')) {
  init().then(() => { console.log('[db] ok'); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
} else {
  main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
}