/**
 * Member pricing and cart totals, computed on the phone exactly as the
 * backend does (backend/app/catalog.py `member_price`, actions.py `_totals`).
 * This is what lets a cart show the right total in a subway tunnel.
 */
import type { Catalog, Product, Shopper } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

export function unitPrice(cat: Catalog | null, shopper: Shopper, list: number, qty: number): number {
  let pct = shopper.membership.discount_pct;
  for (const b of [...(cat?.multi_buy ?? [])].sort((x, y) => y.min_qty - x.min_qty)) {
    if (qty >= b.min_qty) {
      pct += b.extra_pct;
      break;
    }
  }
  return r2(list * (1 - pct / 100));
}

export type PricedLine = { sku: string; name: string; uom: string; qty: number; list_price: number; unit: number; total: number; savings: number; matched: boolean; product: Product };

export type Totals = {
  lines: PricedLine[];
  subtotal: number;
  fee: number;
  tax: number;
  total: number;
  savings: number;
  storeCredit: number;
  due: number;
  points: number;
};

export function priceCart(
  cat: Catalog | null,
  shopper: Shopper,
  cart: Record<string, number>,
  option: string,
  match?: { sku: string; price: number } | null,
): Totals {
  const lines: PricedLine[] = [];
  for (const [sku, qty] of Object.entries(cart)) {
    const product = cat?.products.find((p) => p.sku === sku);
    if (!product || qty < 1) continue;
    const member = unitPrice(cat, shopper, product.list_price, qty);
    const matched = !!match && match.sku === sku && match.price < member;
    const unit = matched ? match!.price : member;
    lines.push({ sku, name: product.name, uom: product.uom, qty, list_price: product.list_price, unit, total: r2(unit * qty), savings: r2((product.list_price - unit) * qty), matched, product });
  }
  const tier = cat?.member_tiers.find((t) => t.code === shopper.membership.tier);
  const subtotal = r2(lines.reduce((s, l) => s + l.total, 0));
  const pickup = option === (cat?.pickup_option ?? 'Store pickup');
  const fee = pickup || !tier || subtotal >= tier.free_delivery_min_usd || lines.length === 0 ? 0 : (cat?.delivery_fee_usd ?? 5.99);
  const tax = r2(subtotal * (cat?.tax_rate ?? 0.0625));
  const total = r2(subtotal + fee + tax);
  const storeCredit = r2(Math.min(shopper.wallet.store_credit_usd ?? 0, total));
  return {
    lines, subtotal, fee, tax, total,
    savings: r2(lines.reduce((s, l) => s + l.savings, 0)),
    storeCredit,
    due: r2(total - storeCredit),
    points: Math.floor(subtotal) * (tier?.points_per_usd ?? 1),
  };
}

/** Days since an ISO date, measured from the export date (the demo's "today"). */
export function daysSince(iso: string | undefined, today: string): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(today.slice(0, 10)) - Date.parse(iso.slice(0, 10))) / 86400000);
}

/** High-demand items carry a per-household limit over a rolling 30 days. */
export function overLimit(shopper: Shopper, product: Product, qty: number): { limit: number; bought: number } | null {
  const limit = product.limit_per_household;
  if (!limit) return null;
  let bought = 0;
  for (const o of shopper.order_history) {
    const d = daysSince(o.date, shopper.export_date);
    if (d != null && d <= 30) for (const l of o.lines) if (l.sku === product.sku) bought += l.qty;
  }
  return bought + qty > limit ? { limit, bought } : null;
}
