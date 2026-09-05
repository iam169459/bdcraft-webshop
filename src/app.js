'use strict';

const path = require('path');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');

const config = require('./config');
const { requireAdmin } = require('./middleware/adminAuth');
const util = require('./util');

const shop = require('./routes/shop');
const cart = require('./routes/cart');
const checkout = require('./routes/checkout');
const order = require('./routes/order');
const admin = require('./routes/admin');
const api = require('./routes/api');

function createApp(pool) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('trust proxy', 1); // Render / proxies: correct req.secure & client IPs
  app.disable('x-powered-by');

  app.use(compression()); // gzip HTML/JS/CSS/JSON responses
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cookieParser(config.sessionSecret));
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureCookies,
      maxAge: 1000 * 60 * 60 * 24,
    },
  }));

  // Basic security headers.
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Static assets: long-lived cache, immutable (hashed-free but CSS/JS rarely change).
  app.use('/css', express.static(path.join(__dirname, '..', 'public', 'css'), { maxAge: '7d' }));
  app.use('/js', express.static(path.join(__dirname, '..', 'public', 'js'), { maxAge: '7d' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // Populate template locals for every request.
  app.use(async (req, res, next) => {
    res.locals.shopName = config.shopName;
    res.locals.mcIp = config.mcIp;
    res.locals.mcVersion = config.mcVersion;
    res.locals.discordUrl = config.discordUrl;
    res.locals.currency = config.currency;
    res.locals.bkashNumber = config.bkashNumber;
    res.locals.bkashName = config.bkashName;
    res.locals.adminNotes = config.adminNotes;
    res.locals.money = util.money;
    res.locals.path = req.path;
    res.locals.isAdmin = !!(req.session && req.session.isAdmin);
    res.locals.error = null;

    try {
      const cartState = await require('./cart').hydrate(req, pool);
      res.locals.cartCount = cartState.count;
      res.locals.cartTotal = cartState.total;
    } catch (err) {
      console.error('[cart hydrate]', err.message);
      res.locals.cartCount = 0;
      res.locals.cartTotal = 0;
    }
    next();
  });

  app.get('/health', (req, res) => res.json({ ok: true, name: config.shopName }));

  app.use('/', shop(pool));
  app.use('/cart', cart(pool));
  app.use('/checkout', checkout(pool));
  app.use('/order', order(pool));
  app.use('/admin', (req, res, next) => {
    // Allow the public login route through without auth.
    if (req.path === '/login') return next();
    return requireAdmin(req, res, next);
  }, admin(pool));
  app.use('/api', api(pool));

  app.use((req, res) => res.status(404).render('404', { title: 'Page not found' }));
  app.use((err, req, res, next) => {
    console.error('[error]', err);
    res.status(500).render('500', { title: 'Server error' });
  });

  return app;
}

module.exports = createApp;