import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useData } from '@/src/data/DataContext';
import { overLimit, priceCart } from '@/src/pricing';
import { theme } from '@/src/theme';
import { ChoiceRow } from '@/src/ui/Choice';
import { Button, Card, Empty, money2, Pill, ProductThumb, SectionTitle, shortName, SyncBadge } from '@/src/ui/components';
import { OrderTracker } from '@/src/ui/OrderTracker';

/**
 * The cart. It starts as the model's smart cart, the shopper edits it, and
 * every number on it - member price, multi-buy, tax, store credit, points -
 * is computed on the phone, so checkout works with no signal.
 */
export default function Cart() {
  const { snap, sync, request, offline, cart, setQty, addToCart, clearCart, refillCart } = useData();
  const insets = useSafeAreaInsets();
  const me = snap.shopper;
  const recs = snap.recs;
  const cat = snap.catalog;
  const [option, setOption] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [reqId, setReqId] = useState<string | null>(null);
  const [wantMatch, setWantMatch] = useState(true);
  // What was just submitted, so a refused order can be put back in the cart.
  const [last, setLast] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!option && me) setOption(me.delivery.default_option);
  }, [me, option]);

  if (!me) return <Empty icon="bag-handle-outline" title="Loading your cart" body="Your smart cart syncs from Couchbase in a moment." />;

  // A price match applies to one item: the first one in the cart a competitor is beating.
  const candidate = (recs?.price_matches ?? []).find((m) => cart[m.sku]);
  const match = candidate && wantMatch ? { sku: candidate.sku, price: candidate.competitor_price_usd } : null;
  const t = priceCart(cat, me, cart, option || me.delivery.default_option, match);
  const stock = new Map<string, number>([...(recs?.lines ?? []), ...(recs?.for_you ?? [])].map((l) => [l.sku, l.on_hand_at_fc]));
  const short = t.lines.filter((l) => stock.has(l.sku) && (stock.get(l.sku) ?? 0) < l.qty);
  const limited = t.lines.map((l) => ({ l, over: overLimit(me, l.product, l.qty) })).filter((x) => x.over);
  const alsoLow = (recs?.lines ?? []).filter((l) => !cart[l.sku]);
  const picks = (recs?.for_you ?? []).filter((l) => !cart[l.sku]).slice(0, 3);
  const tier = cat?.member_tiers.find((x) => x.code === me.membership.tier);
  const pickup = option === (cat?.pickup_option ?? 'Store pickup');

  const submit = async () => {
    const lines = t.lines.map((l) => ({ sku: l.sku, qty: l.qty }));
    const base = { lines, delivery_option: option, notes: notes.trim() };
    const req = match && candidate
      ? await request('request_price_match', { ...base, sku: candidate.sku, competitor: candidate.competitor, competitor_price_usd: candidate.competitor_price_usd },
          `Order with price match · ${money2(t.due)}`)
      : await request('place_order', base, `Order · ${t.lines.length} item${t.lines.length > 1 ? 's' : ''} · ${money2(t.due)}`);
    setLast(cart);
    setReqId(req._id);
    clearCart();
    setNotes('');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Cart</Text>
          <Text style={styles.sub} numberOfLines={1}>{me.membership.tier_name} prices · ships from {cat?.fulfillment_centers[me.delivery.fulfillment_center]?.name ?? me.delivery.fulfillment_center}</Text>
        </View>
        <SyncBadge sync={sync} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {reqId ? (
          <OrderTracker
            id={reqId}
            onRetry={() => {
              Object.entries(last).forEach(([sku, qty]) => setQty(sku, qty));
              setReqId(null);
            }}
            onDone={() => setReqId(null)}
          />
        ) : null}

        {!reqId && t.lines.length === 0 ? (
          <>
            <Empty icon="bag-handle-outline" title="Your cart is empty" body="Start from the smart cart the model built for you, or browse the Shop tab." />
            <View style={{ gap: 8 }}>
              {recs?.lines.some((l) => l.selected) ? <Button label="Fill with my smart cart" icon="sparkles" onPress={refillCart} /> : null}
              <Button label="Browse the shop" kind="ghost" icon="search" onPress={() => router.push('/(tabs)/shop')} />
            </View>
          </>
        ) : null}

        {!reqId && t.lines.length ? (
          <>
            <SectionTitle title={`Items · ${t.lines.length}`} action={<Text style={styles.prov}>started from your smart cart</Text>} />
            <Card style={{ padding: 4 }}>
              {t.lines.map((l, i) => {
                const onHand = stock.get(l.sku);
                return (
                  <View key={l.sku} style={[styles.line, i > 0 && styles.divider]}>
                    <Pressable onPress={() => router.push({ pathname: '/product', params: { sku: l.sku } })}><ProductThumb category={l.product.category} size={42} /></Pressable>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.lineName} numberOfLines={2}>{shortName(l.name)}</Text>
                      <Text style={styles.meta}>
                        {money2(l.unit)} each{l.unit < l.list_price ? ` (list ${money2(l.list_price)})` : ''}
                      </Text>
                      {l.matched ? <Text style={[styles.meta, { color: theme.color.red, fontWeight: '700' }]}>Price match requested</Text> : null}
                      {onHand != null && onHand < l.qty ? (
                        <Text style={[styles.meta, { color: theme.color.warn, fontWeight: '700' }]}>
                          {onHand ? `Only ${onHand} on hand - ${l.qty - onHand} will backorder` : 'Out of stock - this will backorder'}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.stepper}>
                      <Pressable onPress={() => setQty(l.sku, l.qty - 1)} style={styles.step}><Ionicons name={l.qty <= 1 ? 'trash-outline' : 'remove'} size={15} color={theme.color.ink} /></Pressable>
                      <Text style={styles.qty}>{l.qty}</Text>
                      <Pressable onPress={() => setQty(l.sku, l.qty + 1)} style={styles.step}><Ionicons name="add" size={15} color={theme.color.ink} /></Pressable>
                    </View>
                    <Text style={styles.lineTotal}>{money2(l.total)}</Text>
                  </View>
                );
              })}
            </Card>

            {candidate ? (
              <Card style={styles.match}>
                <Ionicons name="pricetags" size={22} color={theme.color.red} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.matchTitle}>Price match: save {money2(candidate.saving_usd)}</Text>
                  <Text style={styles.meta}>{candidate.competitor} has {shortName(candidate.name)} for {money2(candidate.competitor_price_usd)}. Customer Care approves the match before the order is placed.</Text>
                </View>
                <Switch value={wantMatch} onValueChange={setWantMatch} trackColor={{ true: theme.color.red, false: theme.color.border }} thumbColor={theme.color.surface} {...({ activeThumbColor: theme.color.surface } as object)} />
              </Card>
            ) : null}

            {alsoLow.length || picks.length ? (
              <>
                <SectionTitle title="Add before you check out" />
                <View style={{ gap: 8 }}>
                  {alsoLow.map((l) => (
                    <Pressable key={l.sku} onPress={() => addToCart(l.sku, l.qty)}>
                      <Card style={styles.sugg}>
                        <Ionicons name="add-circle" size={20} color={theme.color.red} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lineName} numberOfLines={1}>{l.qty} × {shortName(l.name)}</Text>
                          <Text style={styles.meta} numberOfLines={1}>{l.reason} · {money2(l.unit_price)}</Text>
                        </View>
                        <Pill label="Running low" tone="warn" />
                      </Card>
                    </Pressable>
                  ))}
                  {picks.map((l) => (
                    <Pressable key={l.sku} onPress={() => addToCart(l.sku)}>
                      <Card style={styles.sugg}>
                        <Ionicons name="sparkles" size={18} color={theme.color.info} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lineName} numberOfLines={1}>{shortName(l.name)}</Text>
                          <Text style={styles.meta} numberOfLines={1}>{l.reason} · {money2(l.unit_price)}</Text>
                        </View>
                        <Pill label="For you" tone="info" />
                      </Card>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            <SectionTitle title="Delivery" />
            <Card style={{ padding: 14, gap: 10 }}>
              <ChoiceRow options={(cat?.delivery_options ?? ['Same-day delivery', '2-day shipping', 'Store pickup']).map((w) => ({ value: w, label: w }))} value={option} onChange={setOption} />
              <Text style={styles.meta}>
                {pickup
                  ? `${snap.store?.name ?? me.home_store?.name ?? 'Your store'} · ${snap.store?.hours ?? ''} · free`
                  : `${me.address.street}, ${me.address.city}${me.delivery.notes ? ` · ${me.delivery.notes}` : ''}`}
              </Text>
              <TextInput value={notes} onChangeText={setNotes} placeholder="Notes for the driver or store (optional)" placeholderTextColor={theme.color.faint} style={styles.field} />
            </Card>

            <SectionTitle title="Total" />
            <Card style={{ padding: 14, gap: 6 }}>
              <Tot label="Subtotal" v={t.subtotal} />
              <Tot label={t.fee ? 'Delivery' : pickup ? 'Pickup (free)' : tier && tier.free_delivery_min_usd === 0 ? `Delivery (free with ${tier.name})` : 'Delivery (free over $35)'} v={t.fee} />
              <Tot label="Est. tax" v={t.tax} />
              {t.storeCredit ? <Tot label="Store credit" v={-t.storeCredit} ok /> : null}
              <View style={[styles.tot, styles.totLine]}>
                <Text style={{ fontWeight: '900', color: theme.color.ink, fontSize: theme.type.lg }}>You pay</Text>
                <Text style={{ fontWeight: '900', color: theme.color.red, fontSize: theme.type.xl }}>{money2(t.due)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                <Pill label={`You save ${money2(t.savings)}`} tone="ok" icon="pricetag-outline" />
                <Pill label={`Earns ${t.points} pts`} tone="neutral" icon="star-outline" />
                {short.length ? <Pill label={`${short.length} item${short.length > 1 ? 's' : ''} short`} tone="warn" icon="cube-outline" /> : null}
                {offline ? <Pill label="Will send when connected" tone="warn" icon="cloud-upload-outline" /> : null}
              </View>
              {limited.length ? (
                <>
                  <Text style={styles.warn}>
                    {shortName(limited[0].l.name)} is limited to {limited[0].over!.limit} per household every 30 days and your household already bought {limited[0].over!.bought}. This order would be refused.
                  </Text>
                  <Button label={`Remove ${shortName(limited[0].l.name)}`} icon="trash-outline" onPress={() => setQty(limited[0].l.sku, 0)} />
                  <Button label="Place the order anyway" kind="ghost" onPress={() => void submit()} />
                </>
              ) : match ? (
                <Button label={`Place order with price match · ${money2(t.due)}`} icon="pricetags" onPress={() => void submit()} />
              ) : (
                <Button label={`Place order · ${money2(t.due)}`} icon="bag-check" onPress={() => void submit()} />
              )}
              <Text style={styles.tiny}>
                Priced on this phone from your {me.membership.tier_name} tier. Paying with {me.wallet.payment_method}. The order is saved in Couchbase Lite and sent
                through Sync Gateway when you have a connection; Couchbase AOM runs it as a governed tool call.
              </Text>
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Tot({ label, v, ok }: { label: string; v: number; ok?: boolean }) {
  return (
    <View style={styles.tot}>
      <Text style={styles.meta}>{label}</Text>
      <Text style={{ fontWeight: '700', color: ok ? theme.color.ok : theme.color.text }}>{v < 0 ? `-${money2(-v)}` : money2(v)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: theme.color.surface, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  h1: { fontSize: theme.type.title, fontWeight: '900', color: theme.color.ink },
  sub: { color: theme.color.muted, marginTop: 2, fontSize: theme.type.sm },
  body: { paddingHorizontal: 16, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  meta: { color: theme.color.muted, fontSize: theme.type.sm, lineHeight: 18 },
  tiny: { color: theme.color.faint, fontSize: theme.type.xs, textAlign: 'center', lineHeight: 16, marginTop: 4 },
  warn: { color: theme.color.warn, fontWeight: '700', fontSize: theme.type.sm, lineHeight: 19 },
  prov: { color: theme.color.muted, fontSize: theme.type.xs, fontWeight: '600' },
  line: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 10 },
  divider: { borderTopWidth: 1, borderTopColor: theme.color.border },
  lineName: { fontWeight: '700', color: theme.color.text, fontSize: theme.type.sm },
  lineTotal: { fontWeight: '800', color: theme.color.text, width: 62, textAlign: 'right', fontSize: theme.type.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  step: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.color.bg, alignItems: 'center', justifyContent: 'center' },
  qty: { width: 22, textAlign: 'center', fontWeight: '900', color: theme.color.ink },
  match: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, marginTop: 12, borderWidth: 1, borderColor: theme.color.redSoft },
  matchTitle: { fontWeight: '800', color: theme.color.ink, fontSize: theme.type.md },
  sugg: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12 },
  field: { borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radiusSm, padding: 11, fontSize: theme.type.md, color: theme.color.text },
  tot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totLine: { borderTopWidth: 1, borderTopColor: theme.color.border, paddingTop: 8, marginTop: 2 },
});
