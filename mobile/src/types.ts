/** Document shapes replicated from Couchbase (scope `retail`) into Couchbase Lite. */

export type OrderLine = {
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  list_price?: number;
  savings?: number;
  category?: string;
  uom?: string;
  shipped_qty?: number;
  backordered_qty?: number;
  price_matched?: boolean;
};

export type HistoryOrder = {
  order_id: string;
  date: string;
  status: string;
  channel: string;
  delivery_option?: string;
  eta?: string;
  pickup_store?: string | null;
  line_count: number;
  lines: OrderLine[];
  subtotal_usd?: number;
  total_usd: number;
  backordered?: { sku: string; name: string; qty: number; eta?: string }[];
  price_match?: boolean | { sku: string; competitor: string; matched_price_usd: number; saved_usd: number };
};

export type Subscription = { sku: string; name: string; qty: number; unit_price: number; cadence_weeks: number; next_date: string };

export type Shopper = {
  type: 'shopper';
  shopper_id: string;
  member_number: string;
  export_date: string;
  rev: number;
  first_name: string;
  last_name: string;
  email: string;
  address: { street: string; city: string; state: string; zip: string };
  region_name: string;
  home_store: { store_id: string; name: string; city: string } | null;
  household: { type: string; type_name: string; size: number; pets: string[] };
  membership: { tier: string; tier_name: string; discount_pct: number; member_since: string; renewal_date: string | null };
  wallet: { store_credit_usd: number; points: number; payment_method: string };
  delivery: { default_option: string; notes: string; fulfillment_center: string };
  preferences: { favorite_categories: string[]; avoid_categories: string[]; allow_substitutions: boolean };
  engagement: { last_app_open: string; sessions_30d: number; connectivity_note: string; push_opt_in: boolean };
  order_history: HistoryOrder[];
  replenishment: Record<string, { avg_monthly_qty: number; last_ordered: string; last_qty?: number | null }>;
  spend: { last_12mo_usd: number; ytd_usd: number; avg_order_usd: number; orders_last_12mo: number; category_mix: Record<string, number> };
  subscriptions: Subscription[];
  returns?: { return_id: string; order_id: string; sku: string; name: string; qty: number; refund_usd: number; date: string }[];
  credits?: { credit_id: string; amount_usd: number; reason: string; date: string }[];
  ml_scores: Record<string, unknown> & {
    model_version: string;
    segment: string;
    next_best_offer: string;
    churn_risk: number;
    predicted_basket_usd: number;
    days_to_runout: Record<string, number>;
  };
};

export type Store = {
  type: 'store';
  store_id: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  hours: string;
  phone: string;
  services: string[];
  region_name: string;
  fulfillment_center: string;
  pickup_ready_minutes: number;
  /** Aisle of every SKU in this store - what makes in-store lookups work offline. */
  aisles: Record<string, string>;
};

export type CartLine = {
  sku: string;
  name: string;
  category: string;
  category_name: string;
  uom: string;
  pack: string;
  qty: number;
  list_price: number;
  unit_price: number;
  line_total: number;
  confidence: number | null;
  reason: string;
  on_hand_at_fc: number;
  availability: 'in_stock' | 'low' | 'backorder';
  days_to_runout: number | null;
  aisle: string | null;
  score: number;
  selected: boolean;
  rank: number;
};

export type Pick = {
  sku: string;
  name: string;
  category: string;
  category_name: string;
  uom: string;
  pack: string;
  list_price: number;
  unit_price: number;
  reason: string;
  confidence: number | null;
  on_hand_at_fc: number;
  limit_per_household?: number | null;
  aisle: string | null;
  score: number;
};

export type PriceMatch = {
  sku: string;
  name: string;
  competitor: string;
  competitor_price_usd: number;
  member_price_usd: number;
  saving_usd: number;
  seen_on?: string;
};

export type RecsDoc = {
  type: 'recommendations';
  shopper_id: string;
  /** The smart cart: what the model expects this shopper to run out of. */
  lines: CartLine[];
  for_you: Pick[];
  price_matches: PriceMatch[];
  suggested_total_usd: number;
  suggested_savings_usd: number;
  wallet: { store_credit_usd: number; points: number; payment_method: string; tier: string; tier_name: string; discount_pct: number };
  insights: string[];
  model_version: string;
  segment: string;
  export_date: string;
  shopper_rev: number;
  generated_at: string;
};

export type RequestStatus = 'pending' | 'processing' | 'awaiting_approval' | 'confirmed' | 'partially_shipped' | 'failed';

/** An offline-first order or shopper action: created on the phone, processed by the backend through AOM. */
export type OrderRequest = {
  _id: string;
  type: 'request';
  shopper_id: string;
  tool: string;
  args: Record<string, unknown>;
  title: string;
  status: RequestStatus;
  created_at: string;
  summary?: string;
  charge_usd?: number;
  reason_code?: string | null;
  purchase_limits?: { sku: string; name: string; limit: number; already_bought: number }[] | null;
  item?: Record<string, unknown> & { order_id?: string; backordered?: HistoryOrder['backordered']; eta?: string };
  governed?: boolean;
  trace_id?: string | null;
  approval_id?: string | null;
  completed_at?: string | null;
  _local?: boolean; // created on this device, not yet acknowledged by the server
};

export type ChatMessage = {
  id: string;
  role: 'shopper' | 'assistant';
  text: string;
  at: string;
  intent?: string;
  actions?: SuggestedAction[];
  context?: { status: string; latency_ms: number; kb_mode?: string; build_ms?: number };
  llm?: { status: string; namespace?: string; similarity?: number | null; latency_ms?: number | null; stub?: boolean; composed_locally?: boolean };
  sources?: { title: string; snippet: string; kind: string }[];
  offline?: boolean;
  pending?: boolean;
};

export type SuggestedAction = { label: string; tool?: string; screen?: string; args?: Record<string, unknown> };

export type ChatDoc = {
  type: 'assistant';
  messages: ChatMessage[];
  answers: Record<string, { reply: string; intent: string; at: string; actions?: SuggestedAction[] }>;
};

export type ContextDoc = {
  type: 'context_cache';
  scope: string;
  shopper_id: string | null;
  intent: string;
  personal: boolean;
  export_date: string;
  built_at: string;
  build_ms: number;
  kb_mode: string;
  kb_profile: { title: string; content: string }[];
  kb_guide: { title: string; content: string; answer?: string }[];
  facts: { tool?: string; data?: any };
};

export type Product = {
  sku: string;
  name: string;
  category: string;
  uom: string;
  list_price: number;
  pack: string;
  tags: string[];
  consumable: boolean;
  limit_per_household?: number;
};

export type Catalog = {
  type: 'catalog';
  export_date: string;
  categories: Record<string, string>;
  category_icons: Record<string, string>;
  products: Product[];
  member_tiers: { code: string; name: string; discount_pct: number; points_per_usd: number; free_delivery_min_usd: number; blurb: string }[];
  multi_buy: { min_qty: number; extra_pct: number }[];
  delivery_options: string[];
  pickup_option: string;
  delivery_fee_usd: number;
  tax_rate: number;
  competitors: string[];
  price_match_floor_pct: number;
  fulfillment_centers: Record<string, { name: string; city: string }>;
  faq: { q: string; a: string; keywords: string[] }[];
};

export type SyncState = {
  engine: 'couchbase-lite' | 'preview';
  status: 'connecting' | 'connected' | 'idle' | 'busy' | 'offline' | 'paused' | 'error' | 'stopped';
  lastSyncAt: number | null;
  pendingPush: number;
  detail?: string;
  endpoint?: string;
};
