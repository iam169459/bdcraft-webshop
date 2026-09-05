-- BDCraft webshop schema for Neon Postgres
-- The web backend writes orders here; the Paper/Spigot plugin polls
-- order_items and delivers to players. Run with `node src/db.js --init`
-- (the server also auto-runs it on boot).

CREATE TABLE IF NOT EXISTS products (
  id              SERIAL PRIMARY KEY,
  name            TEXT        NOT NULL,
  slug            TEXT        UNIQUE NOT NULL,
  description     TEXT        DEFAULT '',
  category        TEXT        DEFAULT 'general',
  price_bdt       NUMERIC(12,2) NOT NULL,
  image_url       TEXT        DEFAULT '',
  delivery_type   TEXT        NOT NULL DEFAULT 'money',      -- 'money' | 'item'
  in_game_amount  DOUBLE PRECISION,                          -- in-game coins for 'money'
  item_material   TEXT,                                      -- Bukkit Material e.g. DIAMOND
  item_amount     INT,                                       -- items per unit
  command_template TEXT,                                     -- optional console command, {player} placeholder
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  featured        BOOLEAN     NOT NULL DEFAULT FALSE,
  sort_order      INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id            SERIAL PRIMARY KEY,
  order_code    TEXT UNIQUE NOT NULL,          -- short code shown to buyer, e.g. BDC-8F3K2
  mc_username   TEXT NOT NULL,
  contact       TEXT NOT NULL,                 -- bKash/contact number
  payment_method TEXT NOT NULL DEFAULT 'bkash',-- 'bkash' | 'manual'
  trx_id        TEXT,                          -- transaction reference the buyer provides
  total         NUMERIC(12,2) NOT NULL,
  status        TEXT NOT NULL DEFAULT 'unpaid',
  -- unpaid -> verifying (buyer sent payment & gave TrxID)
  -- verifying -> paid (admin confirmed) ; paid -> delivered (plugin) ; or cancelled/refunded
  note          TEXT DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id              SERIAL PRIMARY KEY,
  order_id        INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      INT REFERENCES products(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  price           NUMERIC(12,2) NOT NULL,      -- unit price BDT snapshot
  qty             INT NOT NULL DEFAULT 1,
  delivery_type   TEXT NOT NULL DEFAULT 'money', -- snapshot
  amount          DOUBLE PRECISION,             -- money total snapshot (already qty-scaled)
  item_material   TEXT,                         -- snapshot
  item_amount     INT,                          -- snapshot: items PER UNIT, worker multiplies by qty
  command_template TEXT,                        -- snapshot
  delivered       BOOLEAN NOT NULL DEFAULT FALSE,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status);
CREATE INDEX IF NOT EXISTS idx_oi_pending      ON order_items(delivered);
CREATE INDEX IF NOT EXISTS idx_oi_order        ON order_items(order_id);