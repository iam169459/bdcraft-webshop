'use strict';

// Small JSON API - the Paper plugin normally reads the DB directly, but this
// gives you an HTTP health/diagnostics endpoint and a way for other copies of
// the site or monitoring tools to check status.

const express = require('express');

module.exports = (pool) => {
  const router = express.Router();

  router.get('/status', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS orders, MAX(created_at) AS last_order FROM orders');
      res.json({ ok: true, service: 'bdcraft-shop', ...rows[0] });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.get('/pending-payments', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT order_code, mc_username, total, payment_method, trx_id, created_at
           FROM orders WHERE status = 'verifying' ORDER BY created_at ASC LIMIT 20`
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return router;
};