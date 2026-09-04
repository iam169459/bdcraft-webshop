'use strict';

const express = require('express');
const router = express.Router();

module.exports = (pool) => {
  router.get('/', async (req, res, next) => {
    try {
      const { rows: featured } = await pool.query(
        `SELECT * FROM products WHERE active = TRUE AND featured = TRUE ORDER BY sort_order, id LIMIT 3`
      );
      res.render('index', { title: 'Home', featured });
    } catch (err) { next(err); }
  });

  router.get('/shop', async (req, res, next) => {
    try {
      const { category } = req.query;
      const params = [];
      let sql = `SELECT * FROM products WHERE active = TRUE`;
      if (category && category !== 'all') {
        params.push(category);
        sql += ` AND category = $${params.length}`;
      }
      sql += ` ORDER BY sort_order, id`;
      const { rows: products } = await pool.query(sql, params);
      const { rows: categories } = await pool.query(
        `SELECT DISTINCT category FROM products WHERE active = TRUE ORDER BY category`
      );
      res.render('shop', { title: 'Shop', products, categories, category: category || 'all' });
    } catch (err) { next(err); }
  });

  return router;
};