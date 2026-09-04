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

async function seedProducts() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM products');
  if (rows[0].n > 0) return;

  const items = [
    {
      name: '500K Coins', slug: '500k-coins', category: 'In-Game Money',
      description: 'Get 500,000 in-game coins instantly on your account.',
      price_bdt: 50, delivery_type: 'money', in_game_amount: 500000,
      item_material: null, item_amount: null, command_template: null, featured: true,
    },
    {
      name: '1M Coins', slug: '1m-coins', category: 'In-Game Money',
      description: 'Get 1,000,000 in-game coins. Best value per taka.',
      price_bdt: 90, delivery_type: 'money', in_game_amount: 1000000,
      item_material: null, item_amount: null, command_template: null, featured: true,
    },
    {
      name: '5M Coins', slug: '5m-coins', category: 'In-Game Money',
      description: 'Big spender pack - 5,000,000 in-game coins.',
      price_bdt: 400, delivery_type: 'money', in_game_amount: 5000000,
      item_material: null, item_amount: null, command_template: null, featured: false,
    },
    {
      name: 'VIP Rank', slug: 'vip-rank', category: 'Ranks',
      description: 'VIP rank for 30 days. Includes /fly in warp zones and exclusive kits.',
      price_bdt: 499, delivery_type: 'item',
      item_material: null, item_amount: null,
      command_template: 'lp user {player} parent add vip', featured: true,
    },
    {
      name: 'Crate Key x5', slug: 'crate-key-5', category: 'Kits & Keys',
      description: '5 legendary crate keys. Spin and win!',
      price_bdt: 120, delivery_type: 'item', item_material: 'TRIPWIRE_HOOK', item_amount: 5,
      command_template: null, featured: true,
    },
    {
      name: 'Miner Kit', slug: 'miner-kit', category: 'Kits & Keys',
      description: 'A full miner kit with enchanted tools.',
      price_bdt: 150, delivery_type: 'item',
      item_material: null, item_amount: null,
      command_template: 'kitgive {player} miner', featured: false,
    },
  ];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await pool.query(
      `INSERT INTO products
        (name, slug, category, description, price_bdt, delivery_type,
         in_game_amount, item_material, item_amount, command_template, featured, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [it.name, it.slug, it.category, it.description, it.price_bdt, it.delivery_type,
       it.in_game_amount ?? null, it.item_material, it.item_amount, it.command_template,
       it.featured, i + 1]
    );
  }
  console.log('[db] seeded sample products');
}

async function init() {
  await initSchema();
  await seedProducts();
}

module.exports = { pool, init, initSchema };