'use strict';

const express = require('express');
const { login } = require('../middleware/adminAuth');
const { STATUS_LABELS, STATUS_COLORS, money } = require('../util');

module.exports = (pool) => {
  const router = express.Router();

  // ---- Auth ----
  router.get('/login', (req, res) => {
    res.render('admin/login', { title: 'Admin login', error: null });
  });

  router.post('/login', (req, res) => {
    const { user, password } = req.body;
    if (login(user, password)) {
      req.session.isAdmin = true;
      const next = req.body.next && !req.body.next.includes('//') ? req.body.next : '/admin';
      return res.redirect(next);
    }
    res.status(401).render('admin/login', { title: 'Admin login', error: 'Wrong username or password.' });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/admin/login'));
  });

  // ---- Dashboard ----
  router.get('/', async (req, res, next) => {
    try {
      const counts = {};
      for (const s of ['unpaid', 'verifying', 'paid', 'delivered', 'cancelled', 'refunded']) {
        const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM orders WHERE status = $1', [s]);
        counts[s] = rows[0].n;
      }
      const { rows: revenue } = await pool.query(
        `SELECT COALESCE(SUM(total),0)::numeric AS total, COUNT(*)::int AS n
           FROM orders WHERE status IN ('paid','delivered')`
      );
      const { rows: recent } = await pool.query(
        `SELECT id, order_code, mc_username, total, payment_method, status, created_at
           FROM orders ORDER BY created_at DESC LIMIT 8`
      );
      res.render('admin/dashboard', {
        title: 'Dashboard', counts, revenue: Number(revenue[0].total),
        paidOrders: revenue[0].n, recent, STATUS_LABELS, STATUS_COLORS,
      });
    } catch (err) { next(err); }
  });

  // ---- Orders ----
  router.get('/orders', async (req, res, next) => {
    try {
      const filter = ['unpaid', 'verifying', 'paid', 'delivered', 'cancelled', 'refunded'].includes(req.query.status)
        ? req.query.status : null;
      const q = filter
        ? `SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC LIMIT 200`
        : `SELECT * FROM orders ORDER BY created_at DESC LIMIT 200`;
      const { rows } = await pool.query(q, filter ? [filter] : []);
      res.render('admin/orders', { title: 'Orders', orders: rows, filter, STATUS_LABELS, STATUS_COLORS });
    } catch (err) { next(err); }
  });

  router.get('/orders/:id', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
      if (rows.length === 0) return res.status(404).send('Order not found');
      const { rows: items } = await pool.query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [rows[0].id]);
      res.render('admin/order', {
        title: `Order ${rows[0].order_code}`, order: rows[0], items,
        STATUS_LABELS, STATUS_COLORS, money,
      });
    } catch (err) { next(err); }
  });

  // Keep valid transitions here; plugin marks delivered on its own via DB.
  const setStatus = (status) => async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM orders WHERE id = $1`, [req.params.id]);
      if (rows.length === 0) return res.status(404).send('Order not found');
      const order = rows[0];

      const updates = { status };
      if (status === 'paid') updates.paid_at = 'now()';
      if (status === 'delivered') updates.delivered_at = 'now()';

      await pool.query(
        `UPDATE orders SET status = $1, paid_at = COALESCE(paid_at, $2), delivered_at = COALESCE(delivered_at, $3), updated_at = now()
         WHERE id = $4`,
        [status, status === 'paid' ? new Date() : order.paid_at,
         status === 'delivered' ? new Date() : order.delivered_at, order.id]
      );
      res.redirect(`/admin/orders/${order.id}`);
    } catch (err) { next(err); }
  };

  router.post('/orders/:id/paid', setStatus('paid'));
  router.post('/orders/:id/cancel', setStatus('cancelled'));
  router.post('/orders/:id/refund', setStatus('refunded'));

  // ---- Products ----
  router.get('/products', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM products ORDER BY sort_order, id`);
      res.render('admin/products', { title: 'Products', products: rows, money });
    } catch (err) { next(err); }
  });

  router.get('/products/new', (req, res) => {
    res.render('admin/product-form', {
      title: 'New product', product: null, form: {}, errors: {},
    });
  });

  router.get('/products/:id/edit', async (req, res, next) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM products WHERE id = $1`, [req.params.id]);
      if (rows.length === 0) return res.status(404).send('Product not found');
      const p = rows[0];
      res.render('admin/product-form', {
        title: `Edit ${p.name}`, product: p, form: {
          name: p.name, slug: p.slug, category: p.category, description: p.description,
          price_bdt: p.price_bdt, delivery_type: p.delivery_type, in_game_amount: p.in_game_amount,
          item_material: p.item_material, item_amount: p.item_amount,
          command_template: p.command_template, image_url: p.image_url,
          featured: p.featured, active: p.active, sort_order: p.sort_order,
        }, errors: {},
      });
    } catch (err) { next(err); }
  });

  const validateProduct = (body) => {
    const errors = {};
    const form = {
      name: String(body.name || '').trim(),
      slug: String(body.slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      category: String(body.category || '').trim() || 'general',
      description: String(body.description || '').trim(),
      price_bdt: Number(body.price_bdt),
      delivery_type: body.delivery_type === 'item' ? 'item' : 'money',
      in_game_amount: body.in_game_amount ? Number(body.in_game_amount) : null,
      item_material: String(body.item_material || '').trim().toUpperCase() || null,
      item_amount: body.item_amount ? Number(body.item_amount) : null,
      command_template: String(body.command_template || '').trim() || null,
      image_url: String(body.image_url || '').trim(),
      featured: !!body.featured,
      active: body.active !== '0',
      sort_order: Number(body.sort_order) || 0,
    };
    if (!form.name) errors.name = 'Name is required.';
    if (!form.slug) errors.slug = 'Slug is required.';
    if (!Number.isFinite(form.price_bdt) || form.price_bdt <= 0) errors.price_bdt = 'Price must be > 0.';
    if (form.delivery_type === 'money' && (!Number.isFinite(form.in_game_amount) || form.in_game_amount <= 0)) {
      errors.in_game_amount = 'In-game coin amount is required for money products.';
    }
    if (form.delivery_type === 'item' && !form.command_template && (!form.item_material || !Number.isFinite(form.item_amount))) {
      errors.item = 'Give either a command template OR a material + amount per unit.';
    }
    if (form.command_template && !form.command_template.includes('{player}')) {
      errors.command = 'Command template must contain the {player} placeholder.';
    }
    return { form, errors };
  };

  const slugExists = async (slug, excludeId) => {
    const { rows } = await pool.query(
      `SELECT 1 FROM products WHERE slug = $1 AND ($2::int IS NULL OR id <> $2)`, [slug, excludeId ?? null]
    );
    return rows.length > 0;
  };

  router.post('/products', async (req, res, next) => {
    try {
      const { form, errors } = validateProduct(req.body);
      if (await slugExists(form.slug, null)) errors.slug = 'Slug already exists.';
      if (Object.keys(errors).length) {
        return res.status(422).render('admin/product-form', { title: 'New product', product: null, form, errors });
      }
      await pool.query(
        `INSERT INTO products
           (name, slug, category, description, price_bdt, delivery_type, in_game_amount,
            item_material, item_amount, command_template, image_url, featured, active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [form.name, form.slug, form.category, form.description, form.price_bdt, form.delivery_type,
         form.in_game_amount, form.item_material, form.item_amount, form.command_template,
         form.image_url, form.featured, form.active, form.sort_order]
      );
      res.redirect('/admin/products');
    } catch (err) { next(err); }
  });

  router.post('/products/:id', async (req, res, next) => {
    try {
      const { form, errors } = validateProduct(req.body);
      if (await slugExists(form.slug, req.params.id)) errors.slug = 'Slug already exists.';
      if (Object.keys(errors).length) {
        return res.status(422).render('admin/product-form', { title: 'Edit product', product: { id: req.params.id }, form, errors });
      }
      await pool.query(
        `UPDATE products SET name=$1, slug=$2, category=$3, description=$4, price_bdt=$5,
           delivery_type=$6, in_game_amount=$7, item_material=$8, item_amount=$9,
           command_template=$10, image_url=$11, featured=$12, active=$13, sort_order=$14
         WHERE id = $15`,
        [form.name, form.slug, form.category, form.description, form.price_bdt, form.delivery_type,
         form.in_game_amount, form.item_material, form.item_amount, form.command_template,
         form.image_url, form.featured, form.active, form.sort_order, req.params.id]
      );
      res.redirect('/admin/products');
    } catch (err) { next(err); }
  });

  router.post('/products/:id/delete', async (req, res, next) => {
    try {
      const active = req.body.active === '1';
      await pool.query(`UPDATE products SET active = $1 WHERE id = $2`, [active, req.params.id]);
      res.redirect('/admin/products');
    } catch (err) { next(err); }
  });

  return router;
};