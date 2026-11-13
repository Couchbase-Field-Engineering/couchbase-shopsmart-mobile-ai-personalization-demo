import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useData } from '@/src/data/DataContext';
import { overLimit, unitPrice } from '@/src/pricing';
import { theme } from '@/src/theme';
import { Button, Card, categoryIcon, Empty, fmtDate, GradientArt, money2, Pill, SectionTitle, shortName, type IconName } from '@/src/ui/components';
import { openAction } from '@/src/ui/nav';

/** One product, rendered entirely from Couchbase Lite: member price, stock, aisle, and why the model picked it. */
export default function ProductScreen() {
  const { sku = '' } = useLocalSearchParams<{ sku: string }>();
  const { snap, cart, addToCart, setQty } = useData();
  const cat = snap.catalog;
  const me = snap.shopper;
  const p = cat?.products.find((x) => x.sku === sku);
  if (!p || !me) return <Empty icon="pricetag-outline" title="Not on this phone yet" body="The catalog syncs from Couchbase in a moment." />;

  const recs = snap.recs;
  const line = recs?.lines.find((l) => l.sku === sku);
  const pick = recs?.for_you.find((l) => l.sku === sku);
  const match = recs?.price_matches.find((m) => m.sku === sku);
  const onHand = line?.on_hand_at_fc ?? pick?.on_hand_at_fc ?? null;
  const unit = unitPrice(cat, me, p.list_price, 1);
  const aisle = snap.store?.aisles?.[sku];
  const rep = me.replenishment[sku];
  const inCart = cart[sku] ?? 0;
  const limit = overLimit(me, p, Math.max(1, inCart));
  const sub = me.subscriptions.find((s) => s.sku === sku);
  const fc = cat?.fulfillment_centers[me.delivery.fulfillment_center]?.name ?? me.delivery.fulfillment_center;
  const multi = [...(cat?.multi_buy ?? [])].sort((a, b) => a.min_qty - b.min_qty);

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Card>
        <GradientArt palette={p.category} icon={categoryIcon(p.category)} height={150}>
          <Pill label={cat?.categories[p.category] ?? p.category} tone="dark" />
          <Text style={styles.sku}>{p.sku}</Text>
        </GradientArt>
        <View style={{ padding: 16, gap: 8 }}>
          <Text style={styles.h2}>{p.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Text style={styles.price}>{money2(unit)}</Text>
            {unit < p.list_price ? <Text style={styles.was}>{money2(p.list_price)}</Text> : null}
            <Text style={styles.meta}>per {p.uom} · {p.pack}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
            {unit < p.list_price ? <Pill label={`${me.membership.tier_name} price · ${me.membership.discount_pct}% off`} tone="red" icon="ribbon-outline" /> : <Pill label="Member price" tone="neutral" />}
            {p.limit_per_household ? <Pill label={`Limit ${p.limit_per_household} per household`} tone="warn" icon="alert-circle-outline" /> : null}
            {sub ? <Pill label={`Subscribed · every ${sub.cadence_weeks} wks`} tone="ok" icon="repeat" /> : null}
          </View>
          {inCart ? (
            <View style={styles.stepRow}>
              <Button label="" icon={inCart <= 1 ? 'trash-outline' : 'remove'} kind="ghost" small onPress={() => setQty(sku, inCart - 1)} />
              <Text style={styles.qty}>{inCart} in cart</Text>
              <Button label="" icon="add" kind="ghost" small onPress={() => setQty(sku, inCart + 1)} />
              <View style={{ flex: 1 }}><Button label="Go to cart" icon="bag-handle" onPress={() => router.replace('/(tabs)/cart')} /></View>
            </View>
          ) : (
            <Button label={`Add to cart · ${money2(unit)}`} icon="add" onPress={() => addToCart(sku)} />
          )}
          {limit ? (
            <Text style={styles.warn}>
              Your household bought {limit.bought} in the last 30 days and the limit is {limit.limit}. An order with this item would be refused.
            </Text>
          ) : null}
        </View>
      </Card>

      {match ? (
        <Card style={styles.match}>
          <Ionicons name="pricetags" size={22} color={theme.color.red} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.matchTitle}>{match.competitor} has it for {money2(match.competitor_price_usd)}</Text>
            <Text style={styles.meta}>Check out with a price match and save {money2(match.saving_usd)}. Customer Care approves it, then the order is placed.</Text>
          </View>
        </Card>
      ) : null}

      <SectionTitle title="Where to get it" />
      <Card style={{ padding: 14, gap: 10 }}>
        <Row icon="cube-outline" label="Delivery" value={onHand == null ? `Ships from the ${fc}` : onHand > 0 ? `${onHand} on hand at the ${fc}` : `Out of stock at the ${fc} - it would backorder`} tone={onHand === 0 ? 'warn' : undefined} />
        {snap.store ? <Row icon="storefront-outline" label="In store" value={`${snap.store.name}${aisle ? ` · aisle ${aisle}` : ''} · ${snap.store.hours}`} /> : null}
        {snap.store ? <Row icon="time-outline" label="Pickup" value={`Usually ready in about ${Math.round(snap.store.pickup_ready_minutes / 30) / 2} hours, always free`} /> : null}
      </Card>

      {line || pick || rep ? (
        <>
          <SectionTitle title="Why you're seeing this" />
          <Card style={{ padding: 14, gap: 10 }}>
            {line ? <Row icon="hourglass-outline" label="Smart cart" value={`${line.reason}${line.confidence != null ? ` · ${Math.round(line.confidence * 100)}% confidence` : ''}`} /> : null}
            {pick ? <Row icon="sparkles-outline" label="Picked for you" value={`${pick.reason}${pick.confidence != null ? ` · ${Math.round(pick.confidence * 100)}% confidence` : ''}`} /> : null}
            {rep ? <Row icon="repeat-outline" label="Your history" value={`About ${rep.avg_monthly_qty} a month · last bought ${fmtDate(rep.last_ordered, { month: 'short', day: 'numeric' })}`} /> : null}
            <Text style={styles.tiny}>From model {recs?.model_version ?? 'shopsmart-next-basket'}, export {me.export_date}. Scored once in Databricks, served from this phone.</Text>
          </Card>
        </>
      ) : null}

      {multi.length ? (
        <>
          <SectionTitle title="Buy more, save more" />
          <Card style={{ padding: 14, gap: 6 }}>
            {multi.map((b) => (
              <View key={b.min_qty} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.meta}>{b.min_qty}+ on one order</Text>
                <Text style={{ fontWeight: '800', color: theme.color.text }}>{money2(unitPrice(cat, me, p.list_price, b.min_qty))} each</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {p.consumable && !sub ? (
        <View style={{ marginTop: 16 }}>
          <Button
            label={`Subscribe & Save · every 4 weeks`}
            icon="repeat"
            kind="dark"
            onPress={() => openAction({ label: 'Subscribe', tool: 'set_subscription', args: { sku, qty: Math.max(1, Number(rep?.last_qty ?? 1)), cadence_weeks: 4 } }, `Subscribe · ${shortName(p.name)}`)}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Row({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone?: 'warn' }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={16} color={theme.color.red} style={{ marginTop: 1 }} />
      <Text style={[styles.meta, { width: 96 }]}>{label}</Text>
      <Text style={{ flex: 1, color: tone === 'warn' ? theme.color.warn : theme.color.text, fontWeight: '600', fontSize: theme.type.sm, lineHeight: 19 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 40 },
  sku: { color: 'rgba(255,255,255,0.8)', fontSize: theme.type.xs, fontWeight: '700', letterSpacing: 1 },
  h2: { fontSize: theme.type.xl, fontWeight: '900', color: theme.color.ink, lineHeight: 25 },
  price: { fontSize: 28, fontWeight: '900', color: theme.color.ink },
  was: { color: theme.color.faint, fontSize: theme.type.md, textDecorationLine: 'line-through' },
  meta: { color: theme.color.muted, fontSize: theme.type.sm, lineHeight: 19 },
  tiny: { color: theme.color.faint, fontSize: theme.type.xs, lineHeight: 16 },
  warn: { color: theme.color.warn, fontWeight: '700', fontSize: theme.type.sm, lineHeight: 19 },
  stepRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  qty: { fontWeight: '900', color: theme.color.ink, minWidth: 64, textAlign: 'center' },
  match: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, marginTop: 12, borderWidth: 1, borderColor: theme.color.redSoft },
  matchTitle: { fontWeight: '800', color: theme.color.ink, fontSize: theme.type.md },
});
