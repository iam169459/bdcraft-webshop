# ⛏ BDCraft Webshop

A complete Minecraft server webshop for **BDCraft** in Bangladesh:

- 🛒 **Storefront** — buy in-game coins, ranks, kits & items (coin rate **1 tk = 10 coins**, configurable via `COIN_RATE`)
- 💳 **bKash / manual payments** — buyer sends money, admin verifies the TrxID
- ⚡ **Automatic in-game delivery** — a Paper/Spigot plugin polls the shared database and grants the purchase, even to offline players
- 🗄 **Neon Postgres** — serverless database shared by the web backend *and* the plugin
- 🌐 **Render-ready** — deploys with one click (`render.yaml`)

```
┌─────────────┐    ┌──────────────────┐    ┌──────────────────────┐    ┌──────────────┐
│   Browser    │───▶│  Web backend     │───▶│   Neon Postgres      │◀───│ Paper plugin  │
│  (shop UI)   │    │  (Render, expr)  │    │  (orders + items)    │    │ (poll+grant)  │
└─────────────┘    └──────────────────┘    └──────────────────────┘    └──────────────┘
```

---

## 1. One-time setup (Neon database)

1. Create a free database at [neon.tech](https://neon.tech). Database name: `bdcraft`.
2. Copy its **connection string** — looks like:
   `postgres://bdcraft_owner:xxx@ep-xxxxx-pooler.us-east-2.aws.neon.tech/bdcraft?sslmode=require`
3. You'll use it in two places: the web `.env` and the plugin `config.yml`.

The web server creates all tables + sample products automatically on first boot (`src/db.js`).

> Neon free tier can suspend after ~5 min of inactivity. Run a free cron (UptimeRobot) hitting
> `https://your-app.onrender.com/health` every 5 minutes if you want instant checkout.

---

## 2. Run the website

```bash
cp .env.example .env
# edit .env -> DATABASE_URL, SESSION_SECRET, ADMIN_PASSWORD, BKASH_NUMBER, shop names
npm install
npm start          # http://localhost:3000
```

Admin panel: **`/admin`** (user/pass from `.env`).

### Admin workflow (bKash)
1. Buyer checks out → picks bKash → sees your `BKASH_NUMBER` + total → sends money → submits TrxID.
2. Order status becomes **verifying**. Check your bKash account, confirm the TrxID matches.
3. In `/admin/orders` click **Mark PAID**.
4. The plugin picks it up within ~10 s and delivers coins/items in-game. Job done.

---

## 3. Deploy to Render

Option A — Blueprint (recommended):
1. Push this folder to a GitHub repo.
2. Render → **New → Blueprint** → select the repo. `render.yaml` is auto-detected.
3. Fill the `sync: false` env vars (`DATABASE_URL`, `ADMIN_PASSWORD`, `DISCORD_URL`).
4. Deploy. Track the logs, then open your app URL.

Option B — Manual web service:
- **Runtime**: Node · **Build**: `npm install` · **Start**: `npm start`
- Add env vars from `.env.example`. Free tier is fine.

---

## 4. Build & install the Paper plugin

The plugin (**`plugin/`**, Java 17, Paper 1.20+) grants purchases in-game.

```bash
cd plugin
mvn clean package          # needs JDK 17 + Maven (or run build with your IDE)
# output: plugin/target/BDCraftShop.jar
```

Edit `plugin/src/main/resources/config.yml` → copy your **old config.yml** from `plugin/` if you
don't want to re-shade every time, or use the final file directly. Put the JDBC URI in:

```yaml
database:
  url: "jdbc:postgresql://ep-xxxxx-pooler.us-east-2.aws.neon.tech:5432/bdcraft?sslmode=require"
  user: "bdcraft_owner"
  password: "xxx"
```

Drop `BDCraftShop.jar` into your server's `plugins/` folder. Requires:
- **Vault** + an economy plugin (EssentialsX, CMI, CoinsEngine…) for coin delivery — *or* change
  `economy.mode` to `command` and provide a fallback command.
- LuckPerms (only if your products use `lp user {player} parent add …` rank commands).

Then `/reload` or restart. Check the console for `BDCraftShop enabled` and `Database connection OK`.

### How delivery works
- Money products → deposited via Vault (or `economy.command`).
- Item products → given to inventory (overflow drops at the player's feet), or a console
  `command_template` is run with `{player}` substituted (ranks/kits).
- Offline buyer → delivered the moment they **join** the server.

---

## 5. How the pieces talk to each other

| Step | Who | What |
|------|-----|------|
| 1 | Web | Buyer adds products → cart cookie → /checkout creates `orders` + `order_items` (status `verifying`) |
| 2 | Admin | Verifies bKash TrxID → order status → `paid` |
| 3 | Plugin | Polls `order_items` (every ~10 s) for `paid` orders, grants, sets `delivered = TRUE` |
| 4 | Plugin | When all items of an order are delivered → order status `delivered` |
| 5 | Buyer | Sees live status on `/order/<CODE>` tracking page |

No web↔plugin HTTP connection needed — **Neon Postgres is the bridge**, exactly as you asked.

---

## Points to review before going live
- Set a strong `ADMIN_PASSWORD`, `SESSION_SECRET` and real `BKASH_NUMBER`.
- `bKash` here is **manual verification** (no merchant API). To fully automate TrxID checks you'd
  apply for the official [bKash Merchant API](https://www.bkash.com/business) and extend
  `src/routes/admin.js` with an auto-verify call.
- `economy.mode` on the plugin defaults to Vault — bundle an economy plugin if you don't have one.
- Everything in this repo uses BDT (৳). To switch currency, change `CURRENCY`.
- The coin deposit packs are priced automatically as `price (tk) × COIN_RATE`. Editing
  `COIN_RATE` in `.env` and redeploying re-prices new packs; previously-seeded packs stay as-is.