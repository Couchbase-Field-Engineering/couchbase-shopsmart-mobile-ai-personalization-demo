"""Backend for the Couchbase ShopSmart mobile AI personalization demo.

  /api/*            shopper sign-in (mints a Sync Gateway session), assistant,
                    status, and a REST "preview sync" used only by the browser
                    preview build
  /shopsmart/mcp/   the shopsmart-shopping MCP server AOM governs

Background tasks: the Databricks export loader/poller and the offline-first
order worker.
"""
from __future__ import annotations

import asyncio
import base64
import contextlib
import hashlib
import hmac
import logging
import time

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import aom_bootstrap, assistant, config, loader, metrics, personalization, rag_app, sgw, worker
from .aom_client import aom
from .docs import (CATALOG_ID, STATE, chat_id, ctx_id, now_iso, recs_id, shopper_channel, shopper_id_doc, store_channel,
                   store_id_doc)
from .mcp_server import mcp
from .store import store

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("shopsmart.api")

PERSONA_BLURBS = {
    "S00101001": "Shops on a subway commute with no signal. Coffee pods are nearly sold out, and the stand mixer she keeps viewing is cheaper at a competitor: a price match that needs approval.",
    "S00101002": "Rural drive home with long dead zones. Two dogs: the dog food is backordered and belongs on Subscribe & Save.",
    "S00101003": "Household of five. Wants a second limited-release console (refused by the purchase limit) and a goodwill credit for a damaged delivery.",
}
_bg: list = []
_LAST_PULL: dict[str, str] = {}


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    await store.connect()

    auto_register = config.AOM_AUTO_REGISTER and bool(config.AOM_ADMIN_PASSWORD)

    async def initial_load():
        try:
            # With self-registration the KB is published once AOM sign-in works.
            await loader.load(kb=not auto_register)
            metrics.export_loaded(loader.STATUS.get("rows", 0))
        except Exception:  # noqa: BLE001
            log.exception("initial export load failed")

    first = asyncio.create_task(initial_load())
    _bg.append(first)
    if auto_register:
        _bg.append(asyncio.create_task(aom_bootstrap.run(first)))
    _bg.append(asyncio.create_task(worker.loop()))
    _bg.append(asyncio.create_task(loader.poll_forever()))
    async with mcp.session_manager.run():
        yield
    for t in _bg:
        t.cancel()


app = FastAPI(title="Couchbase ShopSmart Mobile AI Personalization Demo", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.mount("/shopsmart", mcp.streamable_http_app())


# --------------------------------------------------------------------------
# auth
# --------------------------------------------------------------------------
def _sign(payload: str) -> str:
    return hmac.new(config.APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]


def make_token(shopper_id: str) -> str:
    payload = f"{shopper_id}|{int(time.time()) + config.APP_TOKEN_TTL_SECONDS}"
    return base64.urlsafe_b64encode(f"{payload}|{_sign(payload)}".encode()).decode()


def current_shopper(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in first")
    try:
        rid, exp, sig = base64.urlsafe_b64decode(authorization.split(" ", 1)[1].encode()).decode().split("|")
    except Exception:  # noqa: BLE001
        raise HTTPException(401, "Invalid session") from None
    if not hmac.compare_digest(sig, _sign(f"{rid}|{exp}")) or int(exp) < time.time():
        raise HTTPException(401, "Session expired - sign in again")
    return rid


# --------------------------------------------------------------------------
# routes
# --------------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def index():
    """Landing page: where everything in the demo lives."""
    rows = [
        ("http://localhost:8084/story", "The story: shopping that doesn't wait for signal, and a Databricks bill that stops growing per tap (start here)"),
        ("http://localhost:8084", "The app in a browser (docker compose service <code>web</code>)"),
        ("http://localhost:8203/api/status", "Backend status: export load, Knowledge Base publishing, AOM, Sync Gateway, Databricks offload"),
        ("http://localhost:8203/docs", "Backend API (OpenAPI)"),
        ("http://localhost:8203/shopsmart/mcp", "MCP server <code>shopsmart-shopping</code> (called by AOM)"),
        ("http://localhost:18094", "Couchbase Web Console (Administrator / password123)"),
        ("ws://localhost:4990/shopsmart", "Sync Gateway - Couchbase Lite replicates here"),
        ("https://localhost:8090", "Couchbase Agent Operations Manager (its own stack)"),
    ]
    items = "".join(f'<li><a href="{u}">{u}</a> &nbsp;{d}</li>' for u, d in rows)
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>ShopSmart demo backend</title>
<style>body{{font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;max-width:760px;margin:48px auto;padding:0 16px;color:#0b0b0c}}
h1{{color:#ea2328}} li{{margin:10px 0}} a{{color:#ea2328;font-weight:600}}</style></head>
<body><h1>Couchbase ShopSmart demo</h1>
<p>This is the backend. Open the app at <a href="http://localhost:8084">http://localhost:8084</a>.
Loaded export: <b>{STATE.get("export_date") or "loading..."}</b> ({loader.STATUS.get("state")}).</p>
<ul>{items}</ul></body></html>"""


@app.get("/api/health")
async def health():
    return {"status": "ok", "export_date": STATE.get("export_date"), "load": loader.STATUS.get("state")}


@app.get("/api/status")
async def status():
    aom_state = {"configured": aom.enabled, "url": config.AOM_URL or None, "kb_publisher": aom.admin_enabled,
                 "last_error": aom.last_error, "registration": aom_bootstrap.STATUS, "rag_app": dict(rag_app.STATUS, app_id=config.RAG_APP_ID),
                 "context_namespace": config.CONTEXT_NAMESPACE,
                 "dashboard_url": config.AOM_DASHBOARD_URL or None}
    if aom.enabled:
        try:
            aom_state["health"] = await aom.health()
        except Exception as exc:  # noqa: BLE001
            aom_state["health"] = {"error": str(exc)[:200]}
    return {"store": store.driver, "export_date": STATE.get("export_date"),
            "load": {k: v for k, v in loader.STATUS.items()}, "aom": aom_state, "metrics": metrics.snapshot(),
            "sync_gateway": {"configured": sgw.enabled(), "public_url": config.SG_PUBLIC_URL or None, "db": config.SG_DB},
            "mcp_server": {"server_id": config.AOM_MCP_SERVER_ID, "registered_url": config.AOM_MCP_PUBLIC_URL}}


@app.get("/api/demo/personas")
async def personas():
    out = []
    for sid in loader.PERSONAS:
        sh = await store.get("shoppers", shopper_id_doc(sid))
        if not sh:
            continue
        recs = await store.get("recommendations", recs_id(sid)) or {}
        out.append({"shopper_id": sid, "name": f"{sh['first_name']} {sh['last_name']}", "last_name": sh["last_name"],
                    "member_number": sh["member_number"], "city": f"{sh['address']['city']}, {sh['address']['state']}",
                    "tier": sh["membership"]["tier_name"], "smart_cart_items": len([l for l in recs.get("lines", []) if l.get("selected")]),
                    "home_store": (sh.get("home_store") or {}).get("name"), "blurb": PERSONA_BLURBS.get(sid, "")})
    return {"personas": out, "export_date": STATE.get("export_date")}


class LoginRequest(BaseModel):
    member_number: str
    last_name: str


def _store_of(shopper: dict) -> str | None:
    return (shopper.get("home_store") or {}).get("store_id")


async def _session(shopper: dict) -> dict:
    sid = shopper["shopper_id"]
    # Recommendations are pre-built for recently active shoppers; everyone else gets theirs here.
    if not await store.get("recommendations", recs_id(sid)):
        await personalization.refresh_recommendations(sid)
    return {"token": make_token(sid), "shopper_id": sid, "sync_gateway": await sgw.mint_session(sid, _store_of(shopper)),
            "export_date": STATE.get("export_date")}


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    idx = await store.get("lookups", f"login::{req.member_number.strip()}")
    if not idx or req.last_name.strip().lower() != idx.get("last_name"):
        raise HTTPException(401, "We couldn't find that member number and last name.")
    shopper = await store.get("shoppers", shopper_id_doc(idx["shopper_id"]))
    sid = shopper["shopper_id"]
    return {**await _session(shopper),
            "shopper": {"first_name": shopper["first_name"], "last_name": shopper["last_name"], "email": shopper.get("email"),
                        "tier": shopper["membership"]["tier"], "tier_name": shopper["membership"]["tier_name"],
                        "home_store": shopper.get("home_store")},
            "channels": [shopper_channel(sid), store_channel(_store_of(shopper) or "-"), "catalog"]}


@app.post("/api/auth/refresh")
async def refresh(shopper_id: str = Depends(current_shopper)):
    """Re-mint the Sync Gateway session (24h) for a signed-in shopper - called
    by the app on launch when it has connectivity."""
    shopper = await store.get("shoppers", shopper_id_doc(shopper_id))
    if not shopper:
        raise HTTPException(401, "Sign in again")
    return await _session(shopper)


@app.get("/api/me")
async def me(shopper_id: str = Depends(current_shopper)):
    return await store.get("shoppers", shopper_id_doc(shopper_id))


async def _shopper_docs(shopper_id: str) -> list[dict]:
    out = []
    shopper = await store.get("shoppers", shopper_id_doc(shopper_id))
    if not shopper:
        return out
    out.append({"collection": "shoppers", "id": shopper_id_doc(shopper_id), "doc": shopper})
    sid = _store_of(shopper)
    pairs = [("recommendations", recs_id(shopper_id)), ("assistant", chat_id(shopper_id)), ("catalog", CATALOG_ID)]
    if sid:
        pairs.append(("stores", store_id_doc(sid)))
    pairs += [("context_cache", ctx_id(shopper_id, key)) for key in assistant.CONTEXT_KEYS]
    for col, key in pairs:
        d = await store.get(col, key)
        if d:
            out.append({"collection": col, "id": key, "doc": d})
    for d in await store.orders_for_shopper(shopper_id):
        key = d.pop("_id")
        out.append({"collection": "orders", "id": key, "doc": d})
    return out


@app.get("/api/sync/pull")
async def sync_pull(shopper_id: str = Depends(current_shopper)):
    """Browser-preview stand-in for Sync Gateway: the same documents and ids
    the shopper's channels would replicate into Couchbase Lite."""
    docs = await _shopper_docs(shopper_id)
    # Count only what changed since this shopper's last pull, the way a
    # Couchbase Lite replicator only moves changed revisions - a poll that
    # finds nothing new is not a warehouse query avoided.
    fp = hashlib.sha1("|".join(f"{d['id']}:{d['doc'].get('updated_at') or d['doc'].get('generated_at') or d['doc'].get('rev', '')}:{d['doc'].get('status', '')}"
                               for d in docs).encode()).hexdigest()
    if _LAST_PULL.get(shopper_id) != fp:
        metrics.sync_pull(len(docs) if shopper_id not in _LAST_PULL else max(1, len(docs) // 10))
        _LAST_PULL[shopper_id] = fp
    return {"docs": docs, "at": now_iso(), "export_date": STATE.get("export_date")}


class PushDoc(BaseModel):
    collection: str
    id: str
    doc: dict


class PushRequest(BaseModel):
    docs: list[PushDoc] = Field(default_factory=list)


@app.post("/api/sync/push")
async def sync_push(req: PushRequest, shopper_id: str = Depends(current_shopper)):
    """Browser-preview stand-in for a push replication. Same rule the Sync
    Gateway sync function enforces: a shopper may only create `orders`
    documents, only as themselves, only as `pending`."""
    accepted = []
    for d in req.docs:
        if d.collection != "orders" or d.doc.get("shopper_id") != shopper_id or not d.id.startswith(f"order::{shopper_id}::"):
            raise HTTPException(403, "Only your own orders can be pushed")
        if await store.get("orders", d.id):
            continue
        doc = {**d.doc, "type": "request", "status": "pending", "channels": [shopper_channel(shopper_id)],
               "received_at": now_iso()}
        await store.upsert("orders", d.id, doc)
        accepted.append(d.id)
    if accepted:
        _bg.append(asyncio.create_task(worker.run_once()))
    return {"accepted": accepted}


class AskRequest(BaseModel):
    message: str
    session_id: str | None = None


@app.post("/api/assistant")
async def ask(req: AskRequest, shopper_id: str = Depends(current_shopper)):
    if not req.message.strip():
        raise HTTPException(400, "Ask me something")
    try:
        return await assistant.ask(shopper_id, req.message[:1000], req.session_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from None


@app.post("/api/admin/reload")
async def reload_dump(force: bool = True):
    return {k: v for k, v in (await loader.load(force=force)).items()}
