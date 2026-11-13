"""In-process counters for the story page's live chapter (/api/status ->
metrics). They reset when the backend restarts; AOM keeps the durable view
(traces, cache pages, audit log).

The Databricks counters are the point of the demo for a Databricks shop:
every profile read, recommendation, assistant context and order the app
serves from Couchbase (or from Couchbase Lite on the phone) is a query the
SQL warehouse or model-serving endpoint never had to run. The export lands
once a night; everything after that is served from the data plane.
"""
from __future__ import annotations

import datetime as dt
import os

# Illustrative cost of one interactive query against a Databricks SQL
# warehouse / Model Serving call (compute + egress), used only to turn the
# avoided-query count into a dollar figure on the story page. Tune it to the
# customer's real per-query cost.
DBX_COST_PER_QUERY_USD = float(os.getenv("DBX_COST_PER_QUERY_USD", "0.035"))

STATS: dict = {
    "assistant_turns": 0, "context_hits": 0, "context_misses": 0, "rag_app_turns": 0,
    "llm_calls": 0, "llm_hits": 0,
    "orders": 0, "orders_confirmed": 0, "orders_failed": 0, "orders_awaiting_approval": 0, "order_value_usd": 0.0,
    # Created on the phone well before the backend saw it: queued in
    # Couchbase Lite while the shopper had no connection.
    "orders_queued_offline": 0,
    # Databricks offload: reads answered from Couchbase / Couchbase Lite that
    # would otherwise be warehouse queries (shopper 360, recommendations,
    # pricing, order history) or Model Serving calls (next-basket model).
    "warehouse_queries_avoided": 0,
    "model_serving_calls_avoided": 0,
    "sync_pulls": 0,
    "export_loads": 0,
    "since": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
}
OFFLINE_GAP_SECONDS = 20

# Merchandising: what each way of getting an item into the cart sold, and what
# each kind of promotion gave away. `source` on an order line is set by the
# app when the shopper adds the item (smart cart, a pick, a cross-sell at
# checkout, an upsell, a bundle prompt, a deal, plain browsing).
MERCH: dict = {"revenue_by_source": {}, "units_by_source": {}, "discount_by_rule": {}, "bundles_sold": 0,
               "offers_redeemed": 0, "bonus_points_awarded": 0, "orders_with_promotion": 0, "orders_price_locked": 0}


def merchandising(order_item: dict) -> None:
    for l in order_item.get("lines", []):
        src = l.get("source") or "browse"
        MERCH["revenue_by_source"][src] = round(MERCH["revenue_by_source"].get(src, 0) + l["line_total"], 2)
        MERCH["units_by_source"][src] = MERCH["units_by_source"].get(src, 0) + l["qty"]
    for p in order_item.get("promotions", []):
        MERCH["discount_by_rule"][p["label"]] = round(MERCH["discount_by_rule"].get(p["label"], 0) + p["saved_usd"], 2)
    MERCH["bundles_sold"] += len(order_item.get("bundles_applied", []))
    MERCH["offers_redeemed"] += len(order_item.get("offers_applied", []))
    MERCH["bonus_points_awarded"] += int(order_item.get("bonus_points") or 0)
    MERCH["orders_with_promotion"] += 1 if order_item.get("promotions") else 0
    MERCH["orders_price_locked"] += 1 if order_item.get("price_locked") else 0
    # Pricing rules, offers and affinities for the order were read from Couchbase, not scored live.
    STATS["model_serving_calls_avoided"] += 1


def assistant(result: dict) -> None:
    STATS["assistant_turns"] += 1
    ctx = (result.get("context") or {}).get("status")
    if ctx == "hit":
        STATS["context_hits"] += 1
        # A cached context is an shopper-360 + recommendation read that never went
        # back to the warehouse.
        STATS["warehouse_queries_avoided"] += 2
        STATS["model_serving_calls_avoided"] += 1
    elif ctx:
        STATS["context_misses"] += 1
        # Even a miss is assembled from the nightly export in Couchbase, not
        # from a live warehouse query.
        STATS["warehouse_queries_avoided"] += 1
    if (result.get("context") or {}).get("source") == "aom-rag":
        STATS["rag_app_turns"] += 1
    llm = (result.get("llm") or {}).get("status") or ""
    if llm and llm not in ("local", "error", "skipped"):
        STATS["llm_calls"] += 1
        if llm.startswith("hit"):
            STATS["llm_hits"] += 1


def sync_pull(doc_count: int) -> None:
    """A phone (or the browser preview) pulled its documents: profile, recommendations,
    orders, catalog, store. In a warehouse-backed app each of those screens
    is a query; here they are one replication."""
    STATS["sync_pulls"] += 1
    STATS["warehouse_queries_avoided"] += max(1, doc_count)
    STATS["model_serving_calls_avoided"] += max(0, doc_count // 3)


def export_loaded(rows: int) -> None:
    STATS["export_loads"] += 1


def order(doc: dict, first: bool) -> None:
    """Count an order's outcome. `first` = its first pass through the worker
    (an approval that resolves later is a second pass of the same order)."""
    status = doc.get("status")
    if status in ("processing", "pending"):
        return
    if first:
        STATS["orders"] += 1
        # Pricing, wallet and history lookup for the order came from Couchbase.
        STATS["warehouse_queries_avoided"] += 3
    key = {"confirmed": "orders_confirmed", "partially_shipped": "orders_confirmed",
           "failed": "orders_failed", "awaiting_approval": "orders_awaiting_approval"}.get(status)
    if key:
        STATS[key] += 1
    if status in ("confirmed", "partially_shipped"):
        STATS["order_value_usd"] = round(STATS["order_value_usd"] + float(doc.get("charge_usd") or 0), 2)
    if not first:
        return
    try:
        created = dt.datetime.fromisoformat(str(doc.get("created_at")).replace("Z", "+00:00"))
        if (dt.datetime.now(dt.timezone.utc) - created).total_seconds() > OFFLINE_GAP_SECONDS:
            STATS["orders_queued_offline"] += 1
    except (TypeError, ValueError):
        pass


def snapshot() -> dict:
    s = dict(STATS)
    turns = s["context_hits"] + s["context_misses"]
    s["context_hit_rate"] = round(100 * s["context_hits"] / turns, 1) if turns else None
    s["llm_hit_rate"] = round(100 * s["llm_hits"] / s["llm_calls"], 1) if s["llm_calls"] else None
    s["dbx_cost_per_query_usd"] = DBX_COST_PER_QUERY_USD
    led = MERCH["revenue_by_source"]
    s["merchandising"] = {**MERCH, "recommendation_led_revenue_usd": round(
        sum(v for k, v in led.items() if k in ("pick", "cross_sell", "upsell", "bundle", "deal", "offer", "smart_cart")), 2)}
    s["estimated_dbx_spend_avoided_usd"] = round(
        (s["warehouse_queries_avoided"] + s["model_serving_calls_avoided"]) * DBX_COST_PER_QUERY_USD, 2)
    return s
