'use strict';

const config = require('./config');

// Cart persisted in a signed cookie so it survives server restarts (Render
// free tier) and requires no DB calls on every page. Keys are product IDs.

const CART_COOKIE = 'bdcart';

function parse(cart) {
  if (!Array.isArray(cart)) return {};
  const out = {};
  for (const item of cart) {
    if (item && Number.isInteger(item.p) && Number.isInteger(item.q) && item.q > 0) {
      out[item.p] = (out[item.p] || 0) + item.q;
    }
  }
  return out;
}

function serialize(cart) {
  return Object.entries(cart).map(([p, q]) => ({ p: Number(p), q }));
}

function getCart(req) {
  return parse(req.signedCookies && req.signedCookies[CART_COOKIE]);
}

function setCart(res, cart) {
  res.cookie(CART_COOKIE, serialize(cart), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    maxAge: 1000 * 60 * 60 * 24 * 14, // 14 days
    signed: true,
  });
}

// Compute cart line items against product rows returned by the DB.
async function hydrate(req, db) {
  const cart = getCart(req);
  const ids = Object.keys(cart).map(Number);
  if (ids.length === 0) return { items: [], total: 0, count: 0 };

  const { rows } = await db.query(
    `SELECT * FROM products WHERE id = ANY($1::int[]) AND active = TRUE`, [ids]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = [];
  let total = 0;
  let count = 0;

  for (const [idStr, qty] of Object.entries(cart)) {
    const product = byId.get(Number(idStr));
    const q = Math.min(qty, 99);
    if (!product) continue;
    const subtotal = Number(product.price_bdt) * q;
    total += subtotal;
    count += q;
    items.push({ product, qty: q, unit: Number(product.price_bdt), subtotal });
  }
  return { items, total, count };
}

module.exports = { getCart, setCart, hydrate, CART_COOKIE };