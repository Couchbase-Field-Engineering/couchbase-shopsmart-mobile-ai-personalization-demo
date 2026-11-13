"""`shopsmart-shopping` - the MCP server registered with AOM.

Streamable HTTP at /shopsmart/mcp/. AOM ingests these tool definitions into
its vetted catalog (embeddings for discovery, RBAC per role, drift detection)
and is the only caller the demo expects: the app and assistant reach these
tools through `POST /v1/tools/invoke`, never directly.

Business errors (purchase limit, unknown SKU, bad delivery option) come back
as `{"ok": false, ...}` results rather than MCP errors, so AOM records a
completed call and the shopper gets a useful message instead of a gateway
failure.
"""
from __future__ import annotations

import logging

from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from . import actions

log = logging.getLogger("shopsmart.mcp")

mcp = FastMCP(
    "shopsmart-shopping",
    instructions=("Couchbase ShopSmart shopping for a signed-in shopper: personalized recommendations and smart cart, member "
                  "pricing, fulfillment-center availability, order placement, price matches, Subscribe & Save, returns, "
                  "goodwill credits and preferences."),
    stateless_http=True,
    # Called by AOM over the Docker host gateway, so the Host header is not
    # localhost; same reasoning as AOM's own bundled sample servers.
    transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
)


async def _run(fn, **kw) -> dict:
    try:
        res = await fn(**kw)
    except actions.ToolError as exc:
        return {"ok": False, "status": "failed", "summary": str(exc)}
    return res if isinstance(res, dict) and "ok" in res else {"ok": True, "status": "ok", "data": res}


@mcp.tool()
async def get_shopper_context(shopper_id: str) -> dict:
    """Read a shopper's profile: household, membership tier, wallet (store credit, points), delivery defaults, home store, preferences, last order, subscriptions and model segment."""
    return await _run(actions.get_shopper_context, shopper_id=shopper_id)


@mcp.tool()
async def get_recommendations(shopper_id: str) -> dict:
    """The next-basket model's smart cart for a shopper (what is about to run out), priced at their member tier with on-hand units at their fulfillment center, plus 'for you' picks and price-match candidates."""
    return await _run(actions.get_recommendations, shopper_id=shopper_id)


@mcp.tool()
async def search_catalog(shopper_id: str, query: str = "", category: str = "") -> dict:
    """Search the product catalog for a shopper: member unit price, list price, fulfillment-center on-hand units, aisle at their home store, purchase limit and whether they buy it regularly. category is one of pantry, household, personal, baby, pets, kitchen, electronics, toys, outdoor."""
    return await _run(actions.search_catalog, shopper_id=shopper_id, query=query, category=category)


@mcp.tool()
async def quote_cart(shopper_id: str, lines: list, delivery_option: str = "") -> dict:
    """Price a cart of lines [{sku, qty}] for a shopper: member pricing, multi-buy savings, delivery fee, tax, store credit applied, points earned, purchase-limit check and any short stock."""
    return await _run(actions.quote_cart, shopper_id=shopper_id, lines=lines, delivery_option=delivery_option)


@mcp.tool()
async def place_order(shopper_id: str, lines: list, delivery_option: str = "", notes: str = "") -> dict:
    """Place an order of lines [{sku, qty}] for a shopper at member pricing. Allocates fulfillment-center inventory (backorders the rest), applies store credit and awards points. Fails with reason_code purchase_limit when a limited item exceeds its per-household limit."""
    return await _run(actions.place_order, shopper_id=shopper_id, lines=lines, delivery_option=delivery_option, notes=notes)


@mcp.tool()
async def request_price_match(shopper_id: str, lines: list, sku: str, competitor: str, competitor_price_usd: float,
                              delivery_option: str = "", notes: str = "") -> dict:
    """Place an order of lines [{sku, qty}] with one item (sku) matched to a competitor's lower price. REQUIRES HUMAN APPROVAL (Customer Care). Competitor must be one ShopSmart matches; the matched price has a floor and a per-order cap."""
    return await _run(actions.request_price_match, shopper_id=shopper_id, lines=lines, sku=sku, competitor=competitor,
                      competitor_price_usd=competitor_price_usd, delivery_option=delivery_option, notes=notes)


@mcp.tool()
async def set_subscription(shopper_id: str, sku: str, qty: int, cadence_weeks: int = 4) -> dict:
    """Put an everyday essential on Subscribe & Save for a shopper: qty every 1, 2, 4, 6, 8 or 12 weeks at member price. Subscribed items leave the smart cart."""
    return await _run(actions.set_subscription, shopper_id=shopper_id, sku=sku, qty=qty, cadence_weeks=cadence_weeks)


@mcp.tool()
async def create_return(shopper_id: str, order_id: str, sku: str, qty: int, reason: str) -> dict:
    """Start a return for an item on one of the shopper's orders from the last 30 days. Refunds the member price paid to store credit."""
    return await _run(actions.create_return, shopper_id=shopper_id, order_id=order_id, sku=sku, qty=qty, reason=reason)


@mcp.tool()
async def update_preferences(shopper_id: str, favorite_categories: list | None = None, avoid_categories: list | None = None,
                             default_delivery_option: str = "", allow_substitutions: bool | None = None) -> dict:
    """Save what a shopper wants more of or hidden (category codes), their default delivery option and whether substitutions are allowed. Re-ranks their recommendations."""
    return await _run(actions.update_preferences, shopper_id=shopper_id, favorite_categories=favorite_categories,
                      avoid_categories=avoid_categories, default_delivery_option=default_delivery_option,
                      allow_substitutions=allow_substitutions)


@mcp.tool()
async def issue_goodwill_credit(shopper_id: str, amount_usd: float, reason: str) -> dict:
    """Add a goodwill store credit (up to $100) to a shopper's wallet for a service problem. REQUIRES HUMAN APPROVAL (Customer Care)."""
    return await _run(actions.issue_goodwill_credit, shopper_id=shopper_id, amount_usd=amount_usd, reason=reason)
