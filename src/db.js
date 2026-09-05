'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');

// Neon Postgres requires SSL.
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 10000,
});

async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('[db] schema ready');
}

// Sample catalog. Prices in BDT. Coin deposits are priced at a fixed rate:
//   1 BDT = <COIN_RATE> in-game coins (env, default 10).
// Seeding is idempotent (ON CONFLICT DO NOTHING): new products get added on
// every boot without duplicating or touching products you've edited.
const CATALOG = [
  // ---- In-game money deposits (coins = price_bdt * COIN_RATE) ----
  { name: '200 Coins', slug: 'deposit-20', category: 'In-Game Money',
    description: 'Starter deposit - 200 in-game coins (1 tk = 10 coins).',
    price_bdt: 20, money: true, featured: true },
  { name: '400 Coins', slug: 'deposit-40', category: 'In-Game Money',
    description: 'A quick 400 in-game coins for a small purchase.',
    price_bdt: 40, money: true },
  { name: '500 Coins', slug: 'deposit-50', category: 'In-Game Money',
    description: '500 in-game coins. Great for daily spins and fees.',
    price_bdt: 50, money: true },
  { name: '700 Coins', slug: 'deposit-70', category: 'In-Game Money',
    description: '700 in-game coins deposited instantly on your account.',
    price_bdt: 70, money: true },
  { name: '900 Coins', slug: 'deposit-90', category: 'In-Game Money',
    description: '900 in-game coins - the popular mid buy.',
    price_bdt: 90, money: true, featured: true },
  { name: '1,250 Coins', slug: 'deposit-125', category: 'In-Game Money',
    description: '1,250 in-game coins for regulars.',
    price_bdt: 125, money: true },
  { name: '1,650 Coins', slug: 'deposit-165', category: 'In-Game Money',
    description: '1,650 in-game coins. 10% bonus value vs smaller packs.',
    price_bdt: 165, money: true },
  { name: '2,400 Coins', slug: 'deposit-240', category: 'In-Game Money',
    description: '2,400 in-game coins for active grinders.',
    price_bdt: 240, money: true },
  { name: '4,000 Coins', slug: 'deposit-400', category: 'In-Game Money',
    description: '4,000 in-game coins. The community favourite.',
    price_bdt: 400, money: true },
  { name: '7,500 Coins', slug: 'deposit-750', category: 'In-Game Money',
    description: '7,500 in-game coins plus bonus for veterans.',
    price_bdt: 750, money: true },
  { name: '18,000 Coins', slug: 'deposit-1800', category: 'In-Game Money',
    description: '18,000 in-game coins - the ultimate deposit.',
    price_bdt: 1800, money: true },

  // ---- Kits (item deposits) ----
  { name: 'Starter Kit', slug: 'starter-kit', category: 'Kits & Keys',
    description: 'Food, tools and armor to get you started fast.',
    price_bdt: 20, item: true,
    command_template: 'kitgive {player} starter' },
  { name: 'Miner Kit', slug: 'miner-kit', category: 'Kits & Keys',
    description: 'A full miner kit with enchanted tools.',
    price_bdt: 150, item: true,
    command_template: 'kitgive {player} miner' },
  { name: 'PvP Kit', slug: 'pvp-kit', category: 'Kits & Keys',
    description: 'Sharpened sword, bow and combat gear for the arena.',
    price_bdt: 200, item: true,
    command_template: 'kitgive {player} pvp' },

  // ---- Ranks ----
  { name: 'VIP Rank', slug: 'vip-rank', category: 'Ranks',
    description: 'VIP rank for 30 days. Includes /fly in warp zones and exclusive kits.',
    price_bdt: 499, item: true,
    command_template: 'lp user {player} parent add vip', featured: true },
  { name: 'Hero Rank', slug: 'hero-rank', category: 'Ranks',
    description: 'Hero rank for 30 days. VIP perks + weekly crate key drops.',
    price_bdt: 999, item: true,
    command_template: 'lp user {player} parent add hero' },
  { name: 'Titan Rank', slug: 'titan-rank', category: 'Ranks',
    description: 'Top-tier rank for 30 days. Everything + priority queue access.',
    price_bdt: 1999, item: true,
    command_template: 'lp user {player} parent add titan' },
];

const COIN_RATE = config.coinRate;

// Products that should never appear in the shop. Includes packs seeded at
// the old coin rate and any removed products (e.g. crate keys). Kept here so
// they stay hidden across deploys even if they already exist in the DB.
const RETIRED_SLUGS = [
  '100k-coins', '250k-coins', '500k-coins', '750k-coins', '1m-coins',
  '1p5m-coins', '2m-coins', '3m-coins', '5m-coins', '10m-coins', '25m-coins',
  'crate-key', 'crate-key-5',
];

async function seedProducts() {
  for (let i = 0; i < CATALOG.length; i++) {
    const it = CATALOG[i];
    const deliveryType = it.money ? 'money' : 'item';
    const inGameAmount = it.money ? Number(it.price_bdt) * COIN_RATE : null;
    await pool.query(
      `INSERT INTO products
        (name, slug, category, description, price_bdt, delivery_type,
         in_game_amount, item_material, item_amount, command_template, featured, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (slug) DO NOTHING`,
      [it.name, it.slug, it.category, it.description, it.price_bdt, deliveryType,
       inGameAmount, it.item_material ?? null, it.item_amount ?? null,
       it.command_template ?? null, it.featured ?? false, i + 1]
    );
  }

  // Retire products that are no longer part of the catalog (old coin-rate
  // packs, crate keys, etc.) so they never show up in the shop.
  if (RETIRED_SLUGS.length > 0) {
    await pool.query('UPDATE products SET active = FALSE WHERE slug = ANY($1::text[])', [RETIRED_SLUGS]);
  }

  console.log(`[db] catalog sync complete (${CATALOG.length} products, 1 tk = ${COIN_RATE} coins)`);
}

async function init() {
  await initSchema();
  await seedProducts();
}

module.exports = { pool, init, initSchema };