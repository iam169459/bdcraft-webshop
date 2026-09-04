'use strict';

const express = require('express');
const { STATUS_LABELS, STATUS_COLORS } = require('../util');

module.exports = (pool) => {
  const router = express.Router();

  // Order confirmation + tracking page.
  router.get('/:code', async (req, res, next) => {
    try {
      const code = String(req.params.code).toUpperCase();

      // "TRACK" is the bare search page (linked from the nav), not an order.
      if (code === 'TRACK') {
        return res.render('track', { title: 'Track your order', order: null, items: [] });
      }

      const { rows } = await pool.query(
        `SELECT * FROM orders WHERE order_code = $1`, [code]
      );
      if (rows.length === 0) return res.status(404).render('track', { title: 'Order not found', order: null, items: [] });

      const order = rows[0];
      const { rows: items } = await pool.query(
        `SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [order.id]
      );

      res.render('track', {
        title: `Order ${order.order_code}`,
        order,
        items,
        statusLabel: STATUS_LABELS[order.status] || order.status,
        statusColor: STATUS_COLORS[order.status] || 'bg-slate-100 text-slate-600',
        isPending: ['unpaid', 'verifying'].includes(order.status),
      });
    } catch (err) { next(err); }
  });

  return router;
};