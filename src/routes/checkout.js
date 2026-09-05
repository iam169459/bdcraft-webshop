'use strict';

const express = require('express');
const { getCart, setCart, hydrate } = require('../cart');
const { uniqueOrderCode } = require('../util');

module.exports = (pool) => {
  const router = express.Router();

  // Checkout form - shows the payment instructions for the chosen method.
  router.get('/', async (req, res, next) => {
    try {
      const cart = await hydrate(req, pool);
      if (cart.items.length === 0) return res.redirect('/shop');
      const method = req.query.method === 'manual' ? 'manual' : 'bkash';
      res.render('checkout', {
        title: 'Checkout', cart, method,
        form: { mc_username: '', contact: '', trx_id: '', note: '' },
        errors: {},
      });
    } catch (err) { next(err); }
  });

  // Create the order: status = verifying for bKash/manual until admin verifies.
  router.post('/', async (req, res, next) => {
    try {
      const cart = await hydrate(req, pool);
      if (cart.items.length === 0) return res.redirect('/shop');

      const mc_username = String(req.body.mc_username || '').trim().replace(/[^A-Za-z0-9_]/g, '');
      const contact = String(req.body.contact || '').trim().replace(/[^\d+-]/g, '');
      const trx_id = String(req.body.trx_id || '').trim().slice(0, 60);
      const note = String(req.body.note || '').trim().slice(0, 300);
      const payment_method = req.body.payment_method === 'manual' ? 'manual' : 'bkash';

      const errors = {};
      if (!mc_username || mc_username.length < 3) errors.mc_username = 'Enter your Minecraft username.';
      if (!/^0?1[3-9]\d{8}$/.test(contact)) errors.contact = 'Enter a valid bKash/mobile number (e.g. 01XXXXXXXXX).';
      if (payment_method === 'bkash' && !trx_id) errors.trx_id = 'Enter your bKash TrxID after sending the money.';
      if (payment_method === 'manual' && !trx_id) {
        errors.trx_id = 'Enter a reference/transaction ID for this payment.';
      }

      if (Object.keys(errors).length > 0) {
        return res.status(422).render('checkout', {
          title: 'Checkout', cart, method: payment_method,
          form: { mc_username, contact, trx_id, note }, errors,
        });
      }

      const orderCode = await uniqueOrderCode(pool);
      const total = cart.total;

      // mc_username intentionally kept lowercase for consistent plugin lookups.
      const username = mc_username.toLowerCase();

      const { rows: [order] } = await pool.query(
        `INSERT INTO orders (order_code, mc_username, contact, payment_method, trx_id, total, status)
         VALUES ($1,$2,$3,$4,$5,$6,'verifying')
         RETURNING *`,
        [orderCode, username, contact, payment_method, trx_id, total]
      );

      for (const line of cart.items) {
        const p = line.product;
        const amount = p.delivery_type === 'money' ? Number(p.in_game_amount) * line.qty : null;
        await pool.query(
          `INSERT INTO order_items
             (order_id, product_id, name, price, qty, delivery_type, amount, item_material, item_amount, command_template)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [order.id, p.id, p.name, line.unit, line.qty, p.delivery_type,
           amount, p.item_material, p.item_amount, p.command_template]
        );
      }

      setCart(res, {}); // order placed, empty the cart
      res.redirect(`/order/${orderCode}`);

    } catch (err) { next(err); }
  });

  return router;
};