'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function intEnv(name, def) {
  const v = Number.parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : def;
}

const config = {
  env: process.env.NODE_ENV || 'development',
  port: intEnv('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  secureCookies: process.env.NODE_ENV === 'production',
  shopName: process.env.SHOP_NAME || 'BDCraft',
  mcIp: process.env.MC_IP || 'play.bdcraft.example',
  mcVersion: process.env.MC_VERSION || '1.20.4',
  discordUrl: process.env.DISCORD_URL || '',
  currency: process.env.CURRENCY || 'BDT',
  coinRate: intEnv('COIN_RATE', 10), // in-game coins per 1 BDT
  bkashNumber: process.env.BKASH_NUMBER || '01XXXXXXXXX',
  bkashName: process.env.BKASH_NAME || 'BDCraft Shop',
  adminNotes: process.env.ADMIN_NOTES || 'Send the exact amount via bKash to the number above, then enter your bKash TrxID.',
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-me',
};

if (!config.databaseUrl) {
  console.error('FATAL: DATABASE_URL is not set. Copy .env.example to .env and fill it with your Neon connection string.');
  process.exit(1);
}

module.exports = config;