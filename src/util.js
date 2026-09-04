'use strict';

// Tiny helper: status naming + badge colours for the admin UI.
const STATUS_LABELS = {
  unpaid: 'Unpaid',
  verifying: 'Verifying payment',
  paid: 'Paid - pending delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

const STATUS_COLORS = {
  unpaid: 'bg-slate-100 text-slate-600',
  verifying: 'bg-amber-100 text-amber-700',
  paid: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  refunded: 'bg-rose-100 text-rose-700',
};

function money(bdt, currency = 'BDT') {
  const n = Number(bdt || 0);
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === 'BDT' ? `\u09F3${s}` : `${s} ${currency}`;
}

function bdt(n) {
  return money(n, 'BDT');
}

function genOrderCode() {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = 'BDC-';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function uniqueOrderCode(pool) {
  for (let i = 0; i < 20; i++) {
    const code = genOrderCode();
    const { rows } = await pool.query('SELECT 1 FROM orders WHERE order_code = $1', [code]);
    if (rows.length === 0) return code;
  }
  throw new Error('Could not generate unique order code');
}

module.exports = { STATUS_LABELS, STATUS_COLORS, money, bdt, genOrderCode, uniqueOrderCode };