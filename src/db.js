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

// Sample catalog. Prices in BDT. All money products = in-game coin deposits.
// Seeding is idempotent (ON CONFLICT DO NOTHING): new products get added on
// every boot without duplicating or touching products you've edited.
const CATALOG = [
  // ---- In-game money deposits ----
  { name: '100K Coins', slug: '100k-coins', category: 'In-Game Money',
    description: 'Get 100,000 in-game coins. The classic starter deposit.',
    price_bdt: 20, delivery_type: 'money', in_game_amount: 100000, featured: true },
  { name: '250K Coins', slug: '250k-coins', category: 'In-Game Money',
    description: 'A quick 250,000 coins for a mid-sized purchase in-game.',
    price_bdt: 40, delivery_type: 'money', in_game_amount: 250000, featured: false },
  { name: '500K Coins', slug: '500k-coins', category: 'In-Game Money',
    description: 'Get 500,000 in-game coins instantly on your account.',
    price_bdt: 50, delivery_type: 'money', in_game_amount: 500000, featured: false },
  { name: '750K Coins', slug: '750k-coins', category: 'In-Game Money',
    description: '750,000 coins for players building up their island.',
    price_bdt: 70, delivery_type: 'money', in_game_amount: 750000, featured: false },
  { name: '1M Coins', slug: '1m-coins', category: 'In-Game Money',
    description: 'Get 1,000,000 in-game coins. Best value per taka.',
    price_bdt: 90, delivery_type: 'money', in_game_amount: 1000000, featured: true },
  { name: '1.5M Coins', slug: '1p5m-coins', category: 'In-Game Money',
    description: '1,500,000 coins - skip the early grind.',
    price_bdt: 125, delivery_type: 'money', in_game_amount: 1500000, featured: false },
  { name: '2M Coins', slug: '2m-coins', category: 'In-Game Money',
    description: '2,000,000 in-game coins for serious builders.',
    price_bdt: 165, delivery_type: 'money', in_game_amount: 2000000, featured: false },
  { name: '3M Coins', slug: '3m-coins', category: 'In-Game Money',
    description: '3,000,000 coins. Over 15% bonus value.',
    price_bdt: 240, delivery_type: 'money', in_game_amount: 3000000, featured: false },
  { name: '5M Coins', slug: '5m-coins', category: 'In-Game Money',
    description: 'Big spender pack - 5,000,000 in-game coins.',
    price_bdt: 400, delivery_type: 'money', in_game_amount: 5000000, featured: false },
  { name: '10M Coins', slug: '10m-coins', category: 'In-Game Money',
    description: '10,000,000 coins plus a 25% bonus for veterans.',
    price_bdt: 750, delivery_type: 'money', in_game_amount: 10000000, featured: false },
  { name: '25M Coins', slug: '25m-coins', category: 'In-Game Money',
    description: 'The ultimate deposit - 25,000,000 coins, best rate on the server.',
    price_bdt: 1800, delivery_type: 'money', in_game_amount: 25000000, featured: false },

  // ---- Kits & keys (item deposits) ----
  { name: 'Starter Kit', slug: 'starter-kit', category: 'Kits & Keys',
    description: 'Food, tools and armor to get you started fast.',
    price_bdt: 20, delivery_type: 'item',
    command_template: 'kitgive {player} starter', featured: false },
  { name: 'Crate Key', slug: 'crate-key', category: 'Kits & Keys',
    description: '1 legendary crate key. Spin and win!',
    price_bdt: 30, delivery_type: 'item', item_material: 'TRIPWIRE_HOOK', item_amount: 1, featured: false },
  { name: 'Miner Kit', slug: 'miner-kit', category: 'Kits & Keys',
    description: 'A full miner kit with enchanted tools.',
    price_bdt: 150, delivery_type: 'item',
    command_template: 'kitgive {player} miner', featured: false },
  { name: 'Crate Key x5', slug: 'crate-key-5', category: 'Kits & Keys',
    description: '5 legendary crate keys - bulk discount!',
    price_bdt: 120, delivery_type: 'item', item_material: 'TRIPWIRE_HOOK', item_amount: 5, featured: false },
  { name: 'PvP Kit', slug: 'pvp-kit', category: 'Kits & Keys',
    description: 'Sharpened sword, bow and combat gear for the arena.',
    price_bdt: 200, delivery_type: 'item',
    command_template: 'kitgive {player} pvp', featured: false },

  // ---- Ranks ----
  { name: 'VIP Rank', slug: 'vip-rank', category: 'Ranks',
    description: 'VIP rank for 30 days. Includes /fly in warp zones and exclusive kits.',
    price_bdt: 499, delivery_type: 'item',
    command_template: 'lp user {player} parent add vip', featured: true },
  { name: 'Hero Rank', slug: 'hero-rank', category: 'Ranks',
    description: 'Hero rank for 30 days. VIP perks + weekly crate key drops.',
    price_bdt: 999, delivery_type: 'item',
    command_template: 'lp user {player} parent add hero', featured: false },
  { name: 'Titan Rank', slug: 'titan-rank', category: 'Ranks',
    description: 'Top-tier rank for 30 days. Everything + priority queue access.',
    price_bdt: 1999, delivery_type: 'item',
    command_template: 'lp user {player} parent add titan', featured: false },
];

async function seedProducts() {
  for (let i = 0; i < CATALOG.length; i++) {
    const it = CATALOG[i];
    await pool.query(
      `INSERT INTO products
        (name, slug, category, description, price_bdt, delivery_type,
         in_game_amount, item_material, item_amount, command_template, featured, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (slug) DO NOTHING`,
      [it.name, it.slug, it.category, it.description, it.price_bdt, it.delivery_type,
       it.in_game_amount ?? null, it.item_material ?? null, it.item_amount ?? null,
       it.command_template ?? null, it.featured, i + 1]
    );
  }
  console.log(`[db] catalog sync complete (${CATALOG.length} products)`);
}

async function init() {
  await initSchema();
  await seedProducts();
}

module.exports = { pool, init, initSchema };