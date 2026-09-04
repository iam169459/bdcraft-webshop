'use strict';

const express = require('express');
const { getCart, setCart, hydrate } = require('../cart');

module.exports = (pool) => {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const cart = await hydrate(req, pool);
      res.render('cart', { title: 'Cart', cart });
    } catch (err) { next(err); }
  });

  // Allows both form submits and fetch() calls.
  router.post('/add', (req, res) => {
    const { productId, qty, redirect } = req.body;
    const id = Number(productId);
    const q = Math.max(1, Math.min(99, Number(qty) || 1));
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'bad product' });

    const cart = getCart(req);
    cart[id] = (cart[id] || 0) + q;
    setCart(res, cart);

    if (req.headers['content-type']?.includes('application/json') || req.xhr) {
      return res.json({ ok: true, count: Object.values(cart).reduce((a, b) => a + b, 0) });
    }
    res.redirect(redirect === 'cart' ? '/cart' : '/shop');
  });

  router.post('/update', (req, res) => {
    const cart = getCart(req);
    for (const [idStr, qtyStr] of Object.entries(req.body)) {
      if (idStr === 'redirect') continue;
      const id = Number(idStr);
      const q = Number(qtyStr);
      if (Number.isInteger(id)) {
        if (Number.isInteger(q) && q > 0) cart[id] = Math.min(q, 99);
        else delete cart[id];
      }
    }
    setCart(res, cart);
    res.redirect(req.body.redirect === 'checkout' ? '/checkout' : '/cart');
  });

  router.post('/remove', (req, res) => {
    const cart = getCart(req);
    delete cart[Number(req.body.productId)];
    setCart(res, cart);
    res.redirect(req.body.redirect === 'checkout' ? '/checkout' : '/cart');
  });

  router.post('/clear', (req, res) => {
    setCart(res, {});
    res.redirect('/shop');
  });

  return router;
};