'use strict';

const crypto = require('crypto');
const config = require('../config');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login?next=' + encodeURIComponent(req.originalUrl));
}

function login(user, pass) {
  return safeEqual(user, config.adminUser) && safeEqual(pass, config.adminPassword);
}

module.exports = { requireAdmin, login };