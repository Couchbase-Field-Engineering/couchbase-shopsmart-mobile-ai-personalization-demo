# Couchbase ShopSmart · Mobile AI Personalization on Couchbase
<img width="1280" height="920" alt="image" src="https://github.com/user-attachments/assets/648e4f3c-6e90-4968-bdde-4488afeac5b9" />

An online retail shopping app for **Couchbase ShopSmart**, a fictional retailer. Each shopper's phone holds their profile, a smart cart built for them by a next-basket model, picks chosen for them, the whole catalog and their home store's aisle map in **Couchbase Lite** - so the app keeps working **in a subway tunnel with no signal**. Carts are priced on the phone, orders are captured offline and **sync back through Sync Gateway** the moment the shopper has a connection.

The data comes from a **daily Databricks export** of the personalization model - and that is the only Databricks compute the app ever uses. Every profile read, recommendation, price quote and assistant answer during the day is served from Couchbase (or Couchbase Lite), never from a SQL warehouse or a Model Serving endpoint. The story page counts the warehouse queries that didn't run.

It also covers two retail use cases that usually need live services on the checkout path, **personalized customer experience and smart merchandising**:

* **Targeted recommendations.** The nightly model turns purchase history and loyalty data into personal offers, cross-sells against the live cart ("add trash bags to finish the bundle, save $5.28"), step-ups to a bigger pack, and a "Picked for you" list. All of it renders from Couchbase Lite, and every order line records what led to it so the lift can be measured.
* **Dynamic pricing and bundling.** A rules engine re-prices from real-time inventory (overstock markdowns, promotions paused on items that are nearly sold out), the hour (a quiet-morning breakfast promotion, a pickup discount in the evening delivery peak) and competitor data (close prices are matched automatically, bigger gaps go to a person). It publishes the *rules*, not the prices, as one document per fulfillment center. Sync Gateway puts that document on every phone the center serves, and the phone prices the cart with the same arithmetic as the backend.

The app's assistant is **registered with, and governed by, the Couchbase Agent Operations Manager (AOM)**:

* answers are grounded in AOM's **Knowledge Base** (the Shopping Guide and one profile document per shopper)
* it is registered as an AOM **RAG Application** (`shopsmart-shopping-assistant`), so its queries, cache hits and cost savings show on AOM's *RAG Applications* page
* the context it builds for each personal question is cached in AOM's **Context Cache** and in Couchbase, which syncs it to the phone
* LLM calls go through AOM's **LLM Caching** gateway
* every order, price match, subscription, return, goodwill credit and preference change runs as an RBAC-checked, traced and audited AOM tool call, with human approval for price matches and goodwill credits

The app has the look of couchbase.com - Couchbase red on white, near-black type and dark panels - and carries the Couchbase logo.

Built on the framework of the [Staples field order capture demo](../staples-on-couchbase-ai-demo) (same stack, same repository layout, a consumer shopper in place of a field rep), which is in turn based on [Fujio-Turner/mobile_field_service](https://github.com/Fujio-Turner/mobile_field_service): Expo / React Native, Couchbase Lite via `cbl-reactnative`, Sync Gateway session auth, and offline-first writes that sync when the radio comes back.

---

## How the demo opens

`https://<host>:5151/story` is **Shopping That Knows You. Even Offline.**, an eight-chapter story for the room before the live app. Use ←/→ to move between chapters, **N** for talking points and ☾ for dark mode:

1. **A day in a shopper's pocket.** Why shoppers are offline so often: subway tunnels, parking garages, deep in the store, rural roads, airplane mode, basement apartments. It closes with Maya checking out a $496.48 cart between stations, with an offer, a bundle and the morning promotion already in the price, and a price match that needs approval.
2. **What the app needs.** Eight requirements: four for the phone, four for the AI and the data platform.
3. **The Databricks bill.** The per-request design (a warehouse query per screen, a Model Serving call per session) next to the nightly-export design. Press **Transform the stack**, or **T**, and watch "warehouse queries per day" go from 4,800,000 to 1.
4. **Offline-first, step by step.** The same cart in two phones, one with Couchbase Lite and one online-only. Press **Next step**, or Space.
5. **One data plane for the AI.** Databricks to Couchbase to the AOM Knowledge Base, RAG app and caches, and on to the phone - with live numbers from the running backend: warehouse queries avoided, estimated Databricks spend avoided, Context Cache and LLM cache hit rates, orders captured offline.
6. **Personalized experience and smart merchandising.** Targeted recommendations and dynamic pricing as synced documents instead of live services, with live numbers: recommendation-led revenue, automatic repricings, orders with a promotion, orders price-locked.
7. **Where the Databricks money goes.** Per-request serving vs. nightly export + Couchbase, line by line.
8. **See it run.** Links to the app, the merchandising console and the AOM dashboard, plus a demo script.

`https://<host>:5151/merch` is the **merchandising console**: the live rules for each fulfillment center, with levers for stock, the pricing clock and competitor prices, a log of what the engine changed and why, and what merchandising sold. It has no sign-in, like `/api/admin/reload`; keep the backend off the public internet.

The phone frame's side panel links back to the story. The page is served by the `web` container (`web/story.html`). Its live numbers come from `/api/status`, whose `metrics` include the Databricks offload counters (`warehouse_queries_avoided`, `model_serving_calls_avoided`, `estimated_dbx_spend_avoided_usd` at `DBX_COST_PER_QUERY_USD` per call - set it to the customer's real figure). The AOM link uses `AOM_DASHBOARD_URL`.

## What the demo shows

| Concept | Where you see it |
|---|---|
| **A shopper's whole world, on the phone** | *Home* greets the shopper with their tier, store credit and points, the cart total, "for you today" notes, what is running low and what was picked for them. *Shop* is the whole catalog, searchable offline, with member prices and the aisle at the shopper's home store. A product page shows stock at the fulfillment center, pickup at the store and why the model picked it - all from Couchbase Lite. |
| **Personalization from Databricks** | Each shopper's `recs::<id>` document is the next-basket model's smart cart (what they are about to run out of) and its picks, re-priced at the shopper's member tier (tier discount + multi-buy savings) and checked against on-hand units at their fulfillment center. The cart starts from it and it re-ranks after every order. |
| **Targeted recommendations** | *Offers for you* on Home are issued by the nightly model with the reason and the data behind each one (purchase history, loyalty tier): a category discount, a discount on an item the shopper looked at, bonus points over a basket size. Category and item offers are already in every price the shopper sees. The *Cart* works on the live basket: **finish a bundle** (what to add and what it saves), **goes with** (basket affinities), and **step up** (a bigger pack at a lower unit price, swapped in with one tap). A product page shows the same things for one item. |
| **Dynamic pricing** | `pricing::<fc>` holds the current rules for a fulfillment center: overstock markdowns (10% at 4x the normal stock level, 15% at 4.6x), items held out of promotions (15% of normal stock or less, or flagged high-demand by the forecast), competitor price caps (a competitor within 8% of list is matched automatically), and promotions by hour. The engine rebuilds it after every order and every `PRICING_REFRESH_SECONDS`, and writes it only when something changed. *Home → Today's deals*, the *Deals* filter in Shop and **How this price is built** on a product page all read it from Couchbase Lite. |
| **Dynamic bundling** | Curated bundles come from basket analysis in the export. The engine adds one of its own around the most overstocked item, and pauses any bundle the moment one of its items runs short (Devon's *New pup* bundle is paused because the dog food is sold out at his fulfillment center). |
| **A price that survives the tunnel** | The phone prices with the same arithmetic as the backend (`mobile/src/pricing.ts` mirrors `backend/app/pricing.py`; `backend/tests/test_pricing_parity.py` prices 1,200 random carts both ways and requires them to agree to the cent). Each order carries the rule version and hour it was priced at, and the backend prices it with exactly those rules for up to 48 hours. A cart built offline at 9:40 keeps the breakfast promotion when it syncs at 10:05. |
| **Merchandising console** | `/merch`: click **Overstock** or **Sell down** on an item, move the clock, or type a competitor price. The rules re-version, Sync Gateway delivers them on the `fc:<fc>` channel, and a signed-in phone re-prices within seconds. The console also shows revenue by what led to the item (smart cart, pick, cross-sell, upsell, bundle, deal, offer, browsing). |
| **Personalization the shopper controls** | *My preferences* marks categories "more of" or "hidden". It is saved offline like an order; when it syncs, the backend re-ranks the picks at once - no waiting for tomorrow's model run. |
| **Couchbase Lite: offline and online** | Tap the initials on Home and turn on *No signal* to pause replication. You can still browse, open any product, price a cart, check out (saved as an `orders` document marked **On device**), and ask the assistant. Switch it off: the order syncs and comes back **Confirmed** (or **Partially shipped** with a backorder ETA). |
| **Price match with human approval** | The export carries a competitor price watch. When a cart holds an item a competitor is beating, checkout offers a price match. It runs as `request_price_match`, which AOM holds as **Awaiting Customer Care** until someone approves it on AOM's Approvals page; then the item is re-priced, the order is placed, and the shopper's wallet, history and recommendations update on the phone. |
| **Business rules as governed refusals** | The Nova X console is limited to one per household every 30 days. The cart warns about it on the phone; an order that goes ahead anyway is refused with `reason_code: purchase_limit`, and the assistant explains the rule with the shopper's own purchase date. |
| **Databricks offload** | `/api/status → metrics` counts every profile, recommendation set, price quote and assistant context served from Couchbase instead of a warehouse query or a Model Serving call, and turns it into dollars. Chapter 5 of the story shows it live. |
| **Registered with AOM** | `scripts/register_with_aom.py` (or `AOM_AUTO_REGISTER` in Kubernetes) sets up the **ShopSmart Shopping Assistant** agent identity (role `sales_agent`, scoped to 10 tools), the **`shopsmart-shopping`** MCP server, the approval tier for price matches and goodwill credits, and the **`shopsmart-shopping-assistant` RAG Application**. |
| **AOM RAG Application** | Policy questions ("How does a price match work?") go to `POST /v1/agent/rag/shopsmart-shopping-assistant/query`. AOM retrieves behind its Context Cache, generates behind its LLM Cache, and counts the query on the *RAG Applications* page. The app is scoped to the one *Shopping Guide* document, so a generic question can never retrieve another shopper's profile. |
| **Knowledge Base fed by the daily export** | The loader publishes the *ShopSmart Shopping Guide* plus one *Shopper profile* document per recently active shopper. The assistant always searches with a `document_id` filter, so a personal question can only be grounded in **that** shopper's profile. |
| **Context Caching** | For personal questions the assistant assembles context (the shopper's KB profile chunks, guide chunks and live tool facts: smart cart, member prices, wallet) and caches it in **AOM's Context Cache** (namespace `rag:shopsmart-shopping-assistant:shopper-context`, key `<shopper>:<intent>:<export_date>:r<shopper rev>`). The next question is a `/v1/context/get` hit. The next export or any order changes the key, so the entry is never served stale. The same context is written to Couchbase as `ctx::<shopper>::<intent>`, which syncs to that shopper's phone; that copy is what the offline assistant answers from. Items a question names ("how much is the yoga mat?") are looked up live each turn, so a cached context never answers with another product. |
| **LLM Caching** | Guide questions contain no customer data, so the second shopper to ask the same question gets `LLM cache · exact hit`. Personal questions go through `/v1/llm/complete` in the `rag:shopsmart-shopping-assistant:shopper` namespace, which AOM also attributes to the RAG application. |
| **Governed actions** | `place_order`, `request_price_match`, `set_subscription`, `create_return`, `update_preferences` and `issue_goodwill_credit` all run as `POST /v1/tools/invoke`. AOM re-checks RBAC and the agent's tool scope, traces and audits the call, scans the response, and holds price matches and goodwill credits for a person to approve. |

---

## Architecture

![Architecture: Databricks export, shopper's phone with Couchbase Lite, demo stack (backend, Couchbase Server, Sync Gateway) and the Agent Operations Manager](docs/images/architecture.svg)

| # | Flow |
|---|---|
| **1** | Every morning the Databricks job drops a `dt=YYYY-MM-DD` JSON Lines partition, and the loader picks up the newest one with a `_SUCCESS` marker. Databricks is done for the day. |
| **2** | The loader upserts every shopper, builds the recommendations for every recently active shopper, publishes the catalog and one document per store, and hands the export's pricing signals to the pricing engine, which writes one rules document per fulfillment center in Couchbase Server. The assistant reads and writes its **context cache** there, the worker reads pending orders, and the MCP tools apply orders, wallet changes and preferences. |
| **3** | The loader replaces the AOM **Knowledge Base** documents (the Shopping Guide and one profile per recently active shopper), then re-scopes the **RAG Application** to the new guide. |
| **4** | Sign-in: the backend creates the shopper's Sync Gateway user (channels `shopper:<id>`, `store:<home store>`, `fc:<fulfillment center>`, `catalog`) and mints a session. The assistant is called over `/api`. |
| **5** | **Couchbase Lite** replicates continuously with Sync Gateway. Every screen renders from the phone, and orders become `orders` documents saved locally, even offline. |
| **6** | Guide questions go to the assistant's **RAG Application** in one call. Personal questions check AOM's **Context Cache**; on a miss the assistant does document-scoped **KB retrieval**, stores the context in AOM and Couchbase, recalls **memory**, then calls the **LLM Caching** gateway. |
| **7** | AOM calls the LLM provider only on a cache miss. |
| **8** | Sync Gateway carries orders up and results back down: the phone pushes its pending order, and the confirmation, backorders, updated wallet and re-ranked recommendations come back. |
| **9** | The worker runs each order as the **ShopSmart Shopping Assistant** agent through `POST /v1/tools/invoke`, so RBAC, tool scope, the approval tier, a trace and an audit entry are applied. |
| **10** | AOM calls the `shopsmart-shopping` MCP server, which allocates fulfillment-center inventory, posts the order to the shopper's history and wallet and re-ranks their recommendations in Couchbase, and that syncs back to the phone (2 → 8 → 5). |

### A shopper's workflow, end to end

Maya (Salem, MA, Plus member) signs in at home, opens the app in a subway tunnel, adds the stand mixer to her smart cart, checks out with a price match, and the result syncs back at the top of the station stairs:

```mermaid
sequenceDiagram
  autonumber
  actor M as Maya
  participant App as App + Couchbase Lite
  participant SG as Sync Gateway
  participant BE as Backend
  participant CB as Couchbase Server
  participant AOM as Agent Ops Manager
  participant MCP as shopsmart-shopping MCP

  M->>App: Sign in (member 204817, Chen)
  App->>BE: POST /api/auth/login
  BE->>SG: PUT _user/S00101001 (shopper:S00101001, store:ST-0101, fc:FC-NE, catalog), POST _session
  BE-->>App: app token + SG session
  App->>SG: replicator.start() - continuous PUSH_AND_PULL
  SG-->>App: profile, recommendations, home store, catalog, pricing rules, context cache
  Note over App: Home renders from Couchbase Lite

  Note over M,App: Subway tunnel, no signal
  M->>App: Shop → "mixer" → Add to cart
  Note over App: 9 items priced at Plus, price match offered, $12.50 store credit applied (computed on device)
  M->>App: Place order with price match
  App->>App: save orders/order::S00101001::… status=pending ("On device")
  M->>App: "What am I running low on?"
  App->>App: answered from recs:: + ctx:: docs ("Answered on device")

  Note over App,SG: station stairs - connectivity returns
  App->>SG: push order (sync fn: requireUser, pending only)
  SG->>CB: write
  BE->>CB: worker picks up pending order
  BE->>AOM: tools/invoke request_price_match
  AOM-->>BE: 202 pending_approval
  BE->>CB: order status=awaiting_approval
  SG-->>App: "Awaiting Customer Care"
  Note over AOM: Customer Care approves on the Approvals page
  BE->>AOM: tools/invoke (approval_id)
  AOM->>MCP: call_tool
  MCP->>CB: inventory (CAS), order → shopper history + wallet, recommendations re-ranked, ctx invalidated
  BE->>CB: order status=partially_shipped + summary + trace id
  CB->>SG: import
  SG-->>App: order, profile, recommendation updates
  Note over App: "Order SS-261113-… placed · 1 item backordered"
```

### The daily data flow

```mermaid
sequenceDiagram
  autonumber
  participant DBX as Databricks job
  participant DROP as data/databricks-dump
  participant L as Backend loader
  participant CB as Couchbase Server
  participant AOM as AOM Knowledge Base
  participant SG as Sync Gateway → phones

  DBX->>DROP: dt=2026-11-13/part-0000[0-3].json + _SUCCESS + _manifest.json
  Note over DBX: the warehouse auto-stops - nothing else queries it today
  L->>DROP: poll for newer dt=*/_SUCCESS
  L->>CB: upsert ~13k shoppers (carry forward live orders, wallet, subscriptions, preferences)
  L->>CB: recommendations (recently active shoppers), stores, catalog, pricing rules per fulfillment center, login index
  Note over CB: context caches built from yesterday's export_date are now stale
  L->>AOM: replace "ShopSmart Shopping Guide <date>"
  L->>AOM: replace "Shopper profile <id> <date>" (active within KB_WINDOW_DAYS)
  CB->>SG: import changed docs
  SG-->>SG: each phone pulls only its shopper:<id> + store:<id> + fc:<fc> + catalog channels
```

### Offline-first order lifecycle

```mermaid
stateDiagram-v2
  [*] --> OnDevice: tap Place order (Couchbase Lite)
  OnDevice --> pending: replicator pushes (connectivity)
  pending --> processing: worker claims it
  processing --> confirmed: AOM tools/invoke OK, everything in stock
  processing --> partially_shipped: some items backordered (ETA on the card)
  processing --> awaiting_approval: AOM 202 (price match, goodwill credit)
  awaiting_approval --> confirmed: Customer Care approves in AOM
  awaiting_approval --> failed: denied / expired
  processing --> failed: business rule (purchase limit, unknown SKU…)
  failed --> OnDevice: "Order the rest without it" on the card
  confirmed --> [*]
  partially_shipped --> [*]
```

---

## Quick start

### 1. Browser preview in about 2 minutes (no Docker, no AOM)

The backend can run on an in-memory store, and the app has a browser preview engine that syncs the same documents over REST. Use this to look at the UX. Couchbase Lite needs a device build (step 3).

```bash
python3 databricks/generate_mock_dump.py            # ~100 MB export → data/databricks-dump/dt=<today>/
cd backend && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
DEMO_HOUR=9 uvicorn app.main:app --port 8200        # STORE_DRIVER=memory by default; DEMO_HOUR pins the pricing clock
# new terminal
cd mobile && cp .env.example .env && sed -i '' 's/8203/8200/' .env && npm install && npx expo start --web
```

### 2. Full stack: Couchbase, Sync Gateway and AOM

You need Docker Desktop, and the [Couchbase Agent Operations Manager](https://github.com/erikhinderer/couchbase-agent-operations-manager) running on the same machine at `https://localhost:8090`, with its admin password set.

```bash
cp .env.example .env
./scripts/setup-corporate-ca.sh            # only behind a TLS-inspecting proxy (Zscaler etc.)
python3 databricks/generate_mock_dump.py   # today's export → data/databricks-dump/
docker compose up -d --build               # couchbase, init, sync-gateway, sg-init, backend, web
docker compose logs -f backend             # wait for "Loaded export <date>: … shoppers"

python3 scripts/register_with_aom.py --admin-password '<AOM admin password>'
docker compose up -d --build backend       # picks up AOM_* from .env, publishes the KB, scopes the RAG app
```

`register_with_aom.py` is idempotent. Run it again with `--rotate` to issue a new agent key. After it runs, AOM shows:

* **Agents**: *ShopSmart Shopping Assistant*, role `sales_agent`, scoped to the 10 `shopsmart-shopping::*` tools
* **Servers / Catalog**: `shopsmart-shopping` (trusted) and its tools
* **Knowledge**: *ShopSmart Shopping Guide <date>* and *Shopper profile S… <date>* documents
* **Approvals config**: `shopsmart-shopping::request_price_match` and `::issue_goodwill_credit` require a human
* **RAG Applications**: *ShopSmart Shopping Assistant (mobile)* (`shopsmart-shopping-assistant`), roles `sales_agent` and `admin`, scoped to today's guide document. Its activity counts guide queries plus the assistant's personal LLM calls and context-cache lookups, all in `rag:shopsmart-shopping-assistant:*` namespaces
* **Context Cache**: entries in `rag:shopsmart-shopping-assistant:shopper-context` (one per shopper and intent) and `rag:shopsmart-shopping-assistant` (the RAG app's retrievals)

If the RAG application is created before the backend has published a guide, it is registered **disabled**. The backend enables it and sets its document scope on its next load. `GET http://localhost:8203/api/status` shows its state under `aom.rag_app`.

Configure an LLM provider key in AOM to get generated answers. Without one, AOM returns a labelled stub: the backend then writes the answer itself from the same retrieved context, and AOM still reports the LLM-cache status (hit or miss).

Then open **https://localhost:5151/story** for the story that opens the demo, **https://localhost:5151** for the app in a browser, or **http://localhost:8203** for a page linking every service.

| Port | Service |
|---|---|
| `5151` | **The app in a browser** over HTTPS, behind the sign-in page (`web` service), shown inside a phone frame (add `?frame=0` for full width): same screens and documents, synced over REST instead of Couchbase Lite |
| `8203` | Backend API + MCP server (`/shopsmart/mcp`); `/` lists every link |
| `4990` | Sync Gateway public, which is what phones replicate with: `ws://<host>:4990/shopsmart` |
| `127.0.0.1:4991` | Sync Gateway admin |
| `127.0.0.1:18094` | Couchbase Web Console (Administrator / password123) |

**Sign-in and HTTPS.** The browser UI (the app, the story page and everything else the `web` container serves) is on **`https://<host>:5151`** and opens on a sign-in page:

| Username | Password |
|---|---|
| `demo` | `Couchbase123!` |

Change them with `DEMO_USERNAME` / `DEMO_PASSWORD` in `.env` (Compose) or `web.auth.username` / `web.auth.password` (Helm). The container serves a self-signed certificate it generates on first start, so the browser warns once; add the address people use to `TLS_HOSTS` (Compose) so it is in the certificate, or serve a real one by mounting `tls.crt` / `tls.key` at `/etc/nginx/tls` (Helm: `web.tls.secretName`). Plain `http://` on the same port redirects to HTTPS, and `/signout` ends the session. The sign-in covers the browser UI only: the backend API and Sync Gateway ports are unchanged.

Ports are chosen so this stack runs alongside AOM (8090, 8091-8096), the NOV demo, the cruise demos (8081/8082, 8200/8201, 4984-4986) and the field sales demo (8083, 8202, 4988).

### 3. The app on a device with Couchbase Lite

Couchbase Lite is a native module, so it needs a **development build**; Expo Go can't load it, the same as mobile_field_service. `npm install` runs `scripts/fetch-cbl-native.sh`, which fetches the `cbl-reactnative` native submodules that npm skips.

```bash
cd mobile
cp .env.example .env                       # API + Sync Gateway URLs (LAN IP for a physical phone)
npm install
npx expo run:ios -d "iPhone 16 Pro"        # or: npx expo run:android
npm run start:ios                          # later runs: Metro on localhost
```

The `web` service serves a prebuilt browser bundle (`web/dist.tgz`). After changing the app, rebuild it with `cd mobile && npm run export:web:docker`, then `docker compose up -d --build web`.

With `EXPO_PUBLIC_DB_ENGINE=auto`, the app uses Couchbase Lite whenever the native module is linked. *Account → Offline & sync* (tap the initials on Home) shows the database path, the Sync Gateway endpoint, the replicator status, how many documents are waiting to send and what is on the phone. The same notes as mobile_field_service apply: Xcode 26.4+ needs `plugin.fmt.js` (included), and there is a simulator keyboard toggle (⌘K).

### 4. Kubernetes with Helm (K3s / Rancher)

`deploy/k8s/deploy.sh` deploys AOM (**agent-ops**) and this demo (**shopsmart-app**) onto a single-node K3s cluster, such as one managed by Rancher, without a container registry. Run it from your Mac, in this repository:

```bash
AOM_ADMIN_PASSWORD='<12+ characters>' ./deploy/k8s/deploy.sh      # MOTHER=ehind@192.168.111.4 by default
# mother already runs AOM and the other demos: add this one next to them
AOM_ADMIN_PASSWORD='<current AOM password>' ONLY=shopsmart ./deploy/k8s/deploy.sh
```

To deploy on **hal** (192.168.111.5), where AOM already runs in `agent-ops`:

```bash
AOM_ADMIN_PASSWORD='<current AOM password on hal>' TARGET=hal ONLY=shopsmart ./deploy/k8s/deploy.sh
```

`TARGET` picks the ssh host and the values file (`deploy/k8s/values-hal.yaml`); `MOTHER=` and `VALUES=` override either. `deploy/k8s/values-mother.yaml` publishes this demo on **8084 / 8203 / 4990** so it can run alongside `royal-app` (8081 / 8200 / 4984), `princess-app` (8082 / 8201 / 4986) and the field sales demo (8083 / 8202 / 4988). They all register with the same AOM under different ids, so they show up side by side on AOM's Agents, Servers and RAG Applications pages.

It runs four steps:

1. **Build.** It builds the three AOM images from `AOM_DIR` (default `~/github-couchbaselabs/couchbase-agent-operations-manager`) and this demo's `shopsmart-backend` and `shopsmart-web` images, for the node's CPU architecture.
2. **Import.** It copies the images over SSH and imports them into K3s's containerd. This asks for your sudo password on the node once.
3. **Install.** It runs `helm upgrade --install` on the node for both charts, and installs helm into `~/.local/bin` there if it's missing:
   * `aom` in namespace `agent-ops`, from AOM's own chart with `values-k3s.yaml`
   * `shopsmart-app` in namespace `shopsmart-app`, from [`helm/shopsmart-app`](helm/shopsmart-app) with [`deploy/k8s/values-mother.yaml`](deploy/k8s/values-mother.yaml)
4. **Secrets.** The AOM admin password and any `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` go into mode-600 values files on the node, never onto a command line.

| Resource in `shopsmart-app` | What it does |
|---|---|
| `couchbase` StatefulSet + `couchbase-init` hook Job | Couchbase Server EE 8.0.2. The Job runs the same `init.sh` as Compose |
| `sync-gateway` + `sg-init` hook Job | Sync Gateway 4.0.4. `sync-gateway-public` exposes the replication port for Couchbase Lite |
| `backend` | Loads the export into Couchbase and serves the MCP server. Self-registers with AOM (`AOM_AUTO_REGISTER`) |
| `databricks-dump` PVC | Holds the export. The backend's init container exports today's 100 MiB partition on first start |
| `databricks-daily-export` CronJob | 04:30 America/New_York: exports a new partition and keeps the newest 2. The backend picks it up within 5 minutes |
| `web` | The phone-framed app. nginx proxies `/api` to the backend, so the browser needs only one URL |

**Self-registration.** No register script is needed in the cluster. With `AOM_AUTO_REGISTER=true`, the backend signs in to AOM (setting `AOM_ADMIN_PASSWORD` as the first-login password on a fresh AOM), registers `shopsmart-shopping` at `http://backend.shopsmart-app.svc.cluster.local:8200/shopsmart/mcp`, issues the *ShopSmart Shopping Assistant* agent and keeps its key in Couchbase, turns on the approval tier, and publishes the Knowledge Base and the RAG application. Progress is in `/api/status` under `aom.registration`.

| URL on the node (192.168.111.4) | |
|---|---|
| `https://…:3111` | AOM dashboard (`admin` / `AOM_ADMIN_PASSWORD`) |
| `https://…:5151/story` | The story: start here |
| `https://…:5151` | The app |
| `https://…:5151/merch` | The merchandising console |
| `http://…:8203/api/status` | Backend status, Databricks offload counters |
| `ws://…:4990/shopsmart` | Sync Gateway for Couchbase Lite (point a device build's `EXPO_PUBLIC_SG_URL` here, and `EXPO_PUBLIC_API_URL` at `:8203`) |

---

## Demo script (about 12 minutes)

The figures below are for the pricing clock at **9 am** (`DEMO_HOUR=9`, the default in Docker Compose and Helm; for the browser preview start the backend with `DEMO_HOUR=9 uvicorn …`), so the morning promotion is on whenever you give the demo. Open `/merch` in a second window before you start.

1. **Maya Chen** (member **204817** / **Chen**, Salem MA, Plus)
   * *Home*: "Good morning, Maya", Plus member, $12.50 store credit, 1,840 points. Her cart is already filled from the model: 8 items, **$253.99**. *For you today*: diapers, coffee pods and paper towels are about to run out; only 1 box of coffee pods is left at the Northeast fulfillment center; Brightway Market has the stand mixer for $239.99; and an offer, 10% off Baby. *Offers for you* shows that offer ("You've bought diapers 6 months running", from purchase history) and 500 bonus points on $150 or more (from her loyalty tier). *Today's deals*: the morning coffee run, paper towels at 15% off because the center holds 5.5x its normal stock, and the bundles.
   * Tap her initials → *No signal* **on**. Open *Cart*. The diapers and wipes carry "Your offer · 10% off" and "Baby essentials bundle · 8% off"; the coffee pods say "Selling fast - not in promotions" (one box left, so the engine pulled them from the morning promotion). Under *Add before you check out*, tap **Add ToughLine Tall Kitchen Trash Bags**: it completes the clear-out bundle the engine built around the overstocked paper towels and saves $5.28. Open the diapers to show **How this price is built**.
   * *Shop* → search "mixer" → open it: $265.99 at Plus (list $279.99), aisle F10 at ShopSmart Salem, "Viewed 4 times this month · 93% confidence". **Add to cart** → *Cart*: 10 items, the price-match switch is on, **$510.04** after the match, tax and store credit, and it earns 1,482 points including the 500 bonus. Every number was computed on the phone. **Place order with price match** → **On device**. Ask the assistant "Any deals for me today?" → **Answered on device · Couchbase Lite**.
   * Switch *No signal* **off**: the order syncs, AOM holds it → **Awaiting Customer Care**. Approve it in AOM → *Approvals*; the card flips to **Partially shipped** for the same $510.04 (one box of coffee pods is backordered - the ETA is on the card), her store credit drops to $0, and the bonus-points offer disappears from Home because it was one-time. In AOM, show the trace and audit entry for `shopsmart-shopping::request_price_match`.
   * Ask "How does a price match work?" twice: `Context cache · hit` and `LLM cache · exact hit`. Open **sources**: the Shopping Guide. Ask "What goes with the air fryer?" for a cross-sell answer with the bundle price.
2. **The merchandising console** (`/merch`, with Maya still signed in next to it)
   * *What merchandising sold* already shows Maya's order split by smart cart, bundle and browsing, and one order price-locked.
   * On the phone, tap **Fill with my smart cart** (or add anything from Shop) so there is a cart to re-price.
   * Find *Casa Verde Extra Virgin Olive Oil* and click **Overstock**: the row turns red at 15% off, the change log explains why, and within a few seconds the item appears under *Today's deals* on her phone. Click **Sell down** on the paper towels: the markdown ends, promotions on them pause, and the engine rebuilds its clear-out bundle around the next most overstocked item.
   * Click **18** on the pricing clock. On the phone the greeting changes, the morning promotion is gone, and the Cart's delivery card offers *Skip the rush*: 5% off everything for store pickup during the delivery peak. Type a competitor price a little under list for any item to see it matched automatically; type one far under list and nothing changes, because a gap that large needs a person (the price-match approval in step 1). **Reset the demo** puts everything back.
3. **Devon Walker** (**318552** / **Walker**, Rhinebeck NY, Member): asks the same price-match question and gets an **LLM cache exact hit** from Maya's turn, because the guide namespace is shared and has no customer data. His smart cart is $185.88 and leads with dog food, which is out of stock at the Hudson Valley fulfillment center, so the *New pup* bundle is paused there; his offer is 15% off the pet bed he looked at twice. Place the order → **Partially shipped**, both bags backordered. Open the dog food and put it on **Subscribe & Save**; it leaves the smart cart.
4. **Sofia Alvarez** (**427190** / **Alvarez**, Plano TX, Premier): her smart cart is $183.47. *Shop* → "console" → add the Nova X: it is flagged high demand, so it is never promoted, and the product page and the cart warn that her household bought one six days ago. **Place the order anyway** → refused with `purchase_limit`; **Order the rest without it** places the remainder. Ask "Why can't I buy a second console?". Ask "My delivery arrived damaged" → **Request $15 goodwill credit** (held for approval). Open *Tune* next to "Picked for you", hide Electronics and favor Home & kitchen: her picks re-rank on the next sync.
5. Finish on **story chapters 5 and 6**: the counters moved because of what you just did. Every one in chapter 5 is a Databricks query that didn't run, and chapter 6 shows the revenue that came through a recommendation.

---

## The Databricks export

`databricks/generate_mock_dump.py` writes the exact layout the Databricks notebook produces: Spark JSON Lines part files, `_SUCCESS`, and a `_manifest.json`.

```bash
python3 databricks/generate_mock_dump.py --export-date 2026-11-13 --target-mb 100 --parts 4
```

* **About 13,000 shoppers** across 50 home stores in 8 regions, 100 MiB, deterministic for a given `--seed` on a given Python version. Each part is about 25 MB, under GitHub's 50 MB warning. Every shopper is synthetic.
* One line is **one shopper**: identity, address, home store, household, the ShopSmart Rewards membership (tier, discount, renewal), the wallet (store credit, points, masked payment method), delivery defaults and fulfillment center, preferences, app engagement with a note on where they lose signal, the recent orders with lines, month-to-month replenishment per SKU, 12-month spend, subscriptions, and **`ml_scores`** from `shopsmart-next-basket-v2.3`.
* `ml_scores` holds the per-category affinities, churn risk, predicted basket value, days-to-runout per SKU, the smart-cart lines with a confidence each, recommended items with a reason each, the competitor price watch, segment, next best offer and **`offers`**: the personal offers the model issues, each with a kind (`category_pct`, `sku_pct`, `bonus_points`), the reason shown to the shopper, the data that drove it, an expiry date and whether it is one-time.
* **`_pricing_signals.json`** sits beside the part files: competitor prices per SKU, the SKUs the demand forecast expects to outrun supply, the promotions by hour, the curated bundles, and the basket affinities behind cross-sell (`pairs_with`) and upsell (`upgrades`). The pricing engine combines it with live inventory. An export without the file keeps the previous day's signals.
* Three hand-built **demo shoppers** are always the first rows, with every date relative to the export date so the story is the same in every daily export.
* `databricks/notebooks/shopper_personalization_daily_export.py` is the production equivalent: Customer 360 joins, MLflow model scoring, a Delta table, and the JSON export to a Unity Catalog volume. `databricks/jobs/…job.json` schedules it daily at 04:30 America/New_York. It is the only Databricks compute the app uses; after it finishes the warehouse can auto-stop.

The loader only needs a folder with a newer `dt=*/_SUCCESS` to appear. You can sync the Volume down with `databricks fs cp -r`, or mount the cloud storage behind it into the backend container at `/data/databricks-dump`.

---

## Data model

Bucket `shopsmart`, scope `retail`. Sync Gateway replicates the first seven collections to Couchbase Lite (same scope and collection names on the phone). A shopper's SG user gets the `shopper:<id>`, `store:<home store>`, `fc:<fulfillment center>` and `catalog` channels.

| Collection | Document | Channel | Written by | Notes |
|---|---|---|---|---|
| `shoppers` | `shopper::<id>` | shopper | loader, actions | The export row + `rev` (bumped on every order, wallet change, subscription, return, preference change) |
| `stores` | `store::<id>` | store | loader | Hours, services, pickup time and the aisle of every SKU. A phone only holds its shopper's home store |
| `recommendations` | `recs::<shopper>` | shopper | personalization | Smart cart lines priced with the current rules and fulfillment-center on-hand, "for you" picks, price matches, the shopper's usable `offers`, "for you today" notes |
| `orders` | `order::<shopper>::<uuid>` | shopper | **the phone** (create), worker (status) | Offline-first queue for every shopper action. The sync function allows `requireUser(shopper_id)`, `status: pending` and creation only |
| `assistant` | `chat::<shopper>` | shopper | assistant | History + answers reusable offline (keyed by the question) |
| `context_cache` | `ctx::<shopper>::<intent>`, `ctx::<shopper>::guide_<intent>` | shopper | assistant | Phone copy of the **Context Cache** entry also held in AOM: KB chunks + tool facts, `export_date`, `shopper_rev`, TTL 6h |
| `catalog` | `catalog::v1` | catalog | loader | Products, member tiers, multi-buy savings, delivery options, competitors, fulfillment centers, FAQ, and the basket affinities behind cross-sell (`pairs_with`) and upsell (`upgrades`) |
| `catalog` | `pricing::<fc>` | fc | pricing engine | The pricing rules for one fulfillment center: `sku_rules` (overstock, no_promo, competitor cap), `time_rules`, `bundles`, the discount cap, the pricing clock, on-hand units per SKU, and a `version` hash of the rules. A phone holds only its own center's document |
| `inventory` | `inv::<fc>` | — | actions | On-hand units per SKU per fulfillment center (CAS updates). Server only |
| `lookups` | `login::…`, `kbdoc::…`, `load_state`, `pricing_signals`, `pricinghist::<fc>::<version>` | — | loader, pricing engine | Login index, KB document ids, load status, the pricing engine's inputs, and every rule version of the last 48 hours (TTL) for the price lock. Server only |

The tools on the `shopsmart-shopping` MCP server are `get_shopper_context`, `get_recommendations`, `search_catalog`, `quote_cart`, `place_order`, `request_price_match` (approval required), `set_subscription`, `create_return`, `update_preferences` and `issue_goodwill_credit` (approval required). There are still ten tools. `get_recommendations` and `search_catalog` now also return the shopper's offers and the active deals, and `place_order` and `request_price_match` take three optional arguments: `pricing_version` and `priced_hour` (the price lock) and `sources` (what led to each item). Run `scripts/register_with_aom.py` again after pulling this change so AOM has the new tool definitions. Every tool takes the `shopper_id` it acts for; the worker fills it from the order document, which Sync Gateway only accepted from that signed-in shopper.

Pricing is the same arithmetic in two places, so a cart is right with or without signal: `backend/app/pricing.py` (`quote`) + `actions.py` (`_totals`) on the server and `mobile/src/pricing.ts` on the phone. A line's price is list price minus the sum of its percentages (member tier, multi-buy 3+ / 6+, overstock markdown, the hour's promotion, a personal offer, a bundle), capped at 40% off, then capped at a matched competitor price, then at an approved price match. Totals add 6.25% tax, the delivery fee, store credit and points (plus bonus points). Rounding follows Python's, including exact half cents.

---

## Configuration

Backend variables go in `.env` (see `.env.example`); `docker-compose.yml` sets the infrastructure ones.

| Variable | Default | |
|---|---|---|
| `STORE_DRIVER` | `memory` (compose: `couchbase`) | `memory` keeps the first `MEMORY_SHOPPER_LIMIT` shoppers (1,500), which always include the demo shoppers |
| `RECS_WINDOW_DAYS` | `1` | Recommendations are pre-built for shoppers who opened the app this recently; everyone else gets theirs at sign-in |
| `AOM_URL`, `AOM_AGENT_API_KEY` | — | Agent identity, written by `register_with_aom.py` |
| `AOM_ADMIN_USERNAME`, `AOM_ADMIN_PASSWORD` | — | Used only to publish KB documents |
| `AOM_LLM_PROVIDER`, `AOM_LLM_MODEL` | AOM default | Pin the model completions use |
| `KB_WINDOW_DAYS`, `KB_PROFILE_LIMIT` | `2`, `150` | Which shoppers get a KB profile each day (the demo shoppers always do) |
| `CONTEXT_CACHE_TTL_SECONDS` | `21600` | Upper bound; the export date and shopper rev invalidate it sooner |
| `RAG_APP_ID` | `shopsmart-shopping-assistant` | AOM RAG Application id; `RAG_APP_ENABLED=false` skips it |
| `LLM_NAMESPACE_SHOPPER` / `_GUIDE` | `rag:shopsmart-shopping-assistant:shopper` / `:guide` | Keep the `rag:<app_id>:` prefix so AOM attributes the activity to the app |
| `CONTEXT_NAMESPACE` | `rag:shopsmart-shopping-assistant:shopper-context` | AOM Context Cache namespace for shopper context |
| `DBX_COST_PER_QUERY_USD` | `0.035` | Illustrative cost per warehouse / Model Serving call behind the story's "spend avoided" counter |
| `PRICING_TZ` | `America/New_York` | The time zone the promotions by hour run on. Phones use the same zone, not their own |
| `DEMO_HOUR` | unset (Compose and Helm: `9`) | Pins the pricing clock to an hour 0-23 so the demo script's numbers hold at any time of day. Set it to an empty value for wall time. The console can move the clock while the demo runs |
| `PRICING_REFRESH_SECONDS` | `60` | How often inventory is re-read into the rules. Orders and console changes re-price at once |
| `DEMO_TODAY` | export's `export_date` | Keeps "about to run out" stable whenever you demo |
| `SG_PUBLIC_URL` | — | Replication URL handed to phones |

App variables (`mobile/.env`): `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SG_URL`, `EXPO_PUBLIC_DB_ENGINE` (`auto` · `cbl` · `preview`).

---

## Tests

```bash
cd backend && pytest -q          # 27 tests (the phone/server pricing parity test needs Node and mobile/node_modules, and is skipped without them)
cd mobile && npm run typecheck
```

`test_demo_flows.py` covers sign-in, what syncs to a shopper's phone (their own profile, recommendations and home store, nobody else's), member pricing, the price-match order and its partial shipment, the price-match guardrails, the assistant's context cache (hit, guide path, live item lookup), backorders, Subscribe & Save, the purchase limit, preferences re-ranking the picks, returns and goodwill credits going to store credit, push authorization and the Databricks offload counters. `test_merchandising.py` covers the pricing rules built from inventory, the hour and competitor prices, what reaches a phone on the `fc:` channel, personal offers and their one-time redemption, bundles (applied, paused, and the one the engine builds), the price lock, cross-sell and upsell data, source attribution in the metrics, the console's levers and the assistant's deals answers. `test_aom_integration.py` runs the backend against `tests/fake_aom.py`, which has the same routes and shapes as AOM. It checks KB publishing, document-scoped retrieval, RAG application registration and its guide-only scope, shopper context cached through AOM's Context Cache, the LLM cache shared across shoppers for guide questions but not personal ones, tool calls over real MCP, and the approval tier. `test_aom_bootstrap.py` starts the backend with `AOM_AUTO_REGISTER` against a *fresh* fake AOM and checks that it registers itself end to end.

---

## Repository layout

```
backend/            FastAPI API, MCP server, loader, worker, assistant (Python)
  app/catalog.py        products, household types, member tiers, fulfillment centers, regions, stores (shared with the generator)
  app/personalization.py  the smart cart, picks and price matches per shopper
  app/pricing.py        the merchandising rules engine: inventory + hour + competitor data -> pricing::<fc>, quote(), price lock
  app/actions.py        order / price-match / subscription / return / preference business logic behind every tool
  app/assistant.py      intent → AOM RAG app (guide) | AOM Context Cache → KB + memory + LLM cache (shopper) → actions
  app/rag_app.py        the assistant's AOM RAG Application definition, re-scoped daily
  app/loader.py         daily export → Couchbase (shoppers, recommendations, stores) + AOM Knowledge Base
  app/worker.py         offline-first orders → AOM tools/invoke
  app/metrics.py        story counters, including the Databricks offload
  app/aom_bootstrap.py  self-registration with AOM (Kubernetes)
mobile/             Expo app (Couchbase Lite engine + browser preview engine)
  src/theme.ts          the Couchbase palette
  src/pricing.ts        the same pricing arithmetic on the phone, plus bundle nudges, cross-sell and upsell for the cart
  assets/images/        the Couchbase logo (as supplied, plus a white-wordmark variant and the round mark for icons)
databricks/         mock export generator, PySpark notebook, daily job
couchbase-init/     bucket / scope / collections / indexes
sync-gateway/       bootstrap + database config with per-collection sync functions
scripts/            register_with_aom.py, setup-corporate-ca.sh
web/                nginx image serving the browser build of the app over HTTPS on :5151, behind the sign-in page (proxies /api to the backend) and the story page, and the merchandising console (merch.html)
helm/shopsmart-app/ Helm chart for the demo (Couchbase, Sync Gateway, backend, daily export CronJob, web)
deploy/k8s/         deploy.sh + values for the K3s nodes (AOM and the demo)
data/               the daily export drop folder
```

## Notes

* **Pricing is illustrative.** The thresholds (4x stock for a markdown, 8% for an automatic competitor match, a 40% cap) are constants in `backend/app/catalog.py`, chosen to make the demo readable, not pricing advice. Personalized and time-based pricing is regulated in some markets; the demo keeps promotions as discounts off a public list price and shows the shopper how each price is built.
* **The price lock trusts the phone's hour.** An order names the rule version and hour it was priced at, and the backend honors any version from the last 48 hours. A production build would bound how old a locked price may be and check the claimed hour against when the order was created.
* **Rule documents carry stock.** `pricing::<fc>` includes on-hand units per SKU so product pages can show stock offline, which means it re-syncs after every order at that center. At production volume, split stock into its own document or round it into bands.

* **Brand.** The palette follows couchbase.com (Couchbase red on white, near-black type) and the app, story page and icons use the Couchbase logo from `mobile/assets/images/couchbase-logo.png`. The red in `mobile/src/theme.ts` is sampled from that logo. Swap the file to change the logo everywhere in the app; the story page embeds its own copy.
* **ShopSmart is fictional.** The retailer, its products and house brands, its stores, the competitors it price-matches and every shopper are invented for the demo. Prices, inventory, membership terms and policies are illustrative. There is no product photography: items are shown as category tiles.
* **Databricks numbers.** The offload counters are a demo instrument: they count reads the app served from Couchbase that a per-request design would have sent to a SQL warehouse or Model Serving endpoint, at a flat `DBX_COST_PER_QUERY_USD`. Replace the rate with the customer's blended per-query cost (DBU rate × warehouse size ÷ queries per hour, plus egress) before quoting a figure.
* **Couchbase licensing.** Couchbase Server EE and Sync Gateway EE images run under the free developer license for dev and test. Shipping Couchbase Lite with encryption requires an Enterprise license, the same as mobile_field_service.
