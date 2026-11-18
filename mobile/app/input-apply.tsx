import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { inputApplicationsApi as api } from '../src/lib/api';
import { useI18n } from '../src/i18n';

const STATUS_COLOR: Record<string, string> = { SUBMITTED: '#F59E0B', READY: '#3B82F6', COLLECTED: '#10B981', PROCESSING: '#F59E0B', PARTLY_ISSUED: '#F59E0B', APPROVED: '#10B981', REJECTED: '#EF4444', WITHDRAWN: '#9CA3AF' };
const tzs = (n?: number | null) => (n == null ? '—' : `TZS ${Math.round(n).toLocaleString('en-US')}`);
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

type Opts = { hectares: { farmId: string; areaHectares: number }[]; items: { id: string; name: string; typeName: string; unit: string; unitPrice: number; inStock: number }[]; terms: { version: string; lines: string[] }; blocked: string | null };

export default function InputApplyScreen() {
  const { t } = useI18n();
  const [opts, setOpts] = useState<Opts | null>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0); // 0 = list, 1..3 = the form
  const [farmIds, setFarmIds] = useState<string[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, a] = await Promise.all([api.options(), api.mine()]);
      setOpts(o.data); setApps(a.data?.data ?? []);
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const chosen = (opts?.items ?? []).map((i) => ({ ...i, q: Number(qty[i.id]) || 0 })).filter((i) => i.q > 0);
  const total = chosen.reduce((s, i) => s + i.q * i.unitPrice, 0);
  const over = chosen.some((i) => i.q > i.inStock);
  const reset = () => { setStep(0); setFarmIds([]); setQty({}); setNote(''); setAccepted(false); };
  const toggle = (id: string) => setFarmIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const send = async () => {
    if (!opts) return;
    setBusy(true);
    try {
      await api.apply({ farmIds, lines: chosen.map((i) => ({ itemId: i.id, quantity: i.q })), note: note.trim() || undefined, acceptTerms: true, termsVersion: opts.terms.version });
      reset(); Alert.alert(t('inputApply'), t('inputApplySent')); load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('inputApply'), Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error'));
    } finally { setBusy(false); }
  };
  const withdraw = (a: any) => Alert.alert(t('inputApplyWithdraw'), t('inputApplyWithdrawAsk'), [
    { text: 'No', style: 'cancel' },
    { text: t('inputApplyWithdraw'), style: 'destructive', onPress: async () => { try { await api.withdraw(a.id); load(); } catch { /* ignore */ } } },
  ]);

  if (loading && !opts) return <SafeAreaView style={styles.container} edges={['bottom']}><Stack.Screen options={{ headerShown: true, title: t('inputApply') }} /><View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View></SafeAreaView>;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('inputApply') }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 && (
          <>
            <Text style={styles.muted}>{t('inputApplyIntro')}</Text>
            {opts?.blocked ? <Text style={[styles.muted, { color: '#EF4444', marginTop: 10 }]}>{opts.blocked}</Text>
              : !opts?.hectares.length ? <Text style={[styles.muted, { marginTop: 10 }]}>{t('inputApplyNoHectares')}</Text>
              : !opts?.items.length ? <Text style={[styles.muted, { marginTop: 10 }]}>{t('inputApplyNoItems')}</Text>
              : <TouchableOpacity style={[styles.primary, { marginTop: 14 }]} onPress={() => { setFarmIds(opts.hectares.length === 1 ? [opts.hectares[0].farmId] : []); setStep(1); }}><Text style={styles.primaryText}>{t('inputApply')}</Text></TouchableOpacity>}
            <Text style={styles.section}>{t('inputApplyMine')}</Text>
            {apps.length === 0 && <Text style={styles.muted}>{t('inputApplyNone')}</Text>}
            {apps.map((a) => (
              <View key={a.id} style={styles.card}>
                <View style={styles.row}><Text style={styles.cardTitle}>{a.reference}</Text><Text style={{ fontSize: 12, fontWeight: '700', color: STATUS_COLOR[a.status] }}>{t(`inputApplyStatus_${a.status}` as any)}</Text></View>
                <Text style={styles.line}>{a.lines.map((l: any) => `${l.item} ${l.quantity} ${l.unit}`).join(', ')}</Text>
                <Text style={styles.muted}>Farm ID {a.farmIds.join(', ')} · {day(a.submittedAt)}</Text>
                {!!a.warehouse && a.status === 'READY' && <Text style={[styles.line, { fontWeight: '700' }]}>{t('inputApplyCollectAt')}: {a.warehouse.name}{a.warehouse.location ? ` (${a.warehouse.location})` : ''}</Text>}
                <Text style={styles.line}>{tzs(a.estimatedTotal)}</Text>
                {!!a.rejectReason && <Text style={styles.muted}>{t('inputApplyReason')}: {a.rejectReason}</Text>}
                {a.status === 'SUBMITTED' && <TouchableOpacity onPress={() => withdraw(a)}><Text style={[styles.link, { color: '#EF4444' }]}>{t('inputApplyWithdraw')}</Text></TouchableOpacity>}
              </View>
            ))}
          </>
        )}

        {step === 1 && opts && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('inputApplyStep1')}</Text>
            {opts.hectares.map((h) => (
              <TouchableOpacity key={h.farmId} style={[styles.option, farmIds.includes(h.farmId) && styles.optionOn]} onPress={() => toggle(h.farmId)}>
                <Text style={[styles.optionText, farmIds.includes(h.farmId) && { color: '#065F46', fontWeight: '700' }]}>{farmIds.includes(h.farmId) ? '✓ ' : ''}Farm ID {h.farmId} · {h.areaHectares} ha</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={reset}><Text style={styles.secondaryText}>{t('inputApplyBack')}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, { flex: 2, marginTop: 0, marginBottom: 0 }, !farmIds.length && { opacity: 0.5 }]} disabled={!farmIds.length} onPress={() => setStep(2)}><Text style={styles.primaryText}>{t('inputApplyNext')}</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {step === 2 && opts && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('inputApplyStep2')}</Text>
            {opts.items.map((i) => (
              <View key={i.id} style={{ marginTop: 12 }}>
                <Text style={styles.optionText}>{i.name} <Text style={styles.muted}>· {i.typeName}</Text></Text>
                <Text style={styles.muted}>{tzs(i.unitPrice)} {t('inputApplyPerUnit')} {i.unit} · {i.inStock} {i.unit} {t('inputApplyInStock')}</Text>
                <TextInput style={[styles.input, Number(qty[i.id]) > i.inStock && { borderColor: '#EF4444' }]} keyboardType="decimal-pad" placeholder={`${t('inputApplyQty')} (${i.unit})`} value={qty[i.id] ?? ''} onChangeText={(v) => setQty({ ...qty, [i.id]: v.replace(/[^0-9.]/g, '') })} />
              </View>
            ))}
            <Text style={styles.label}>{t('inputApplyNote')}</Text>
            <TextInput style={styles.input} maxLength={300} value={note} onChangeText={setNote} />
            {chosen.length > 0 && <Text style={[styles.line, { marginTop: 12, fontWeight: '700' }]}>{t('inputApplyEstimate')}: {tzs(total)}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={() => setStep(1)}><Text style={styles.secondaryText}>{t('inputApplyBack')}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, { flex: 2, marginTop: 0, marginBottom: 0 }, (!chosen.length || over) && { opacity: 0.5 }]} disabled={!chosen.length || over} onPress={() => setStep(3)}><Text style={styles.primaryText}>{t('inputApplyNext')}</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {step === 3 && opts && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('inputApplyStep3')}</Text>
            <Text style={[styles.line, { marginTop: 10 }]}>Farm ID {farmIds.join(', ')}</Text>
            {chosen.map((i) => <Text key={i.id} style={styles.line}>• {i.name}: {i.q} {i.unit} — {tzs(i.q * i.unitPrice)}</Text>)}
            <Text style={[styles.line, { fontWeight: '700' }]}>{t('inputApplyEstimate')}: {tzs(total)}</Text>
            <Text style={styles.label}>{t('inputApplyTerms')}</Text>
            {opts.terms.lines.map((l, i) => <Text key={i} style={[styles.line, { marginTop: 6 }]}>{i + 1}. {l}</Text>)}
            <TouchableOpacity style={[styles.option, accepted && styles.optionOn, { marginTop: 14 }]} onPress={() => setAccepted(!accepted)}>
              <Text style={[styles.optionText, accepted && { color: '#065F46', fontWeight: '700' }]}>{accepted ? '☑ ' : '☐ '}{t('inputApplyAccept')}</Text>
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={() => setStep(2)} disabled={busy}><Text style={styles.secondaryText}>{t('inputApplyBack')}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, { flex: 2, marginTop: 0, marginBottom: 0 }, (!accepted || busy) && { opacity: 0.5 }]} disabled={!accepted || busy} onPress={send}><Text style={styles.primaryText}>{busy ? '…' : t('inputApplySubmit')}</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  muted: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  line: { fontSize: 13, color: '#374151', marginTop: 4 },
  section: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 18, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 12, color: '#6B7280', marginTop: 14, marginBottom: 4, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff', marginTop: 6 },
  option: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, marginTop: 8 },
  optionOn: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  optionText: { fontSize: 14, color: '#374151' },
  primary: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 12 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB' },
  secondaryText: { color: '#374151', fontWeight: '700' },
  link: { color: '#10B981', fontSize: 13, fontWeight: '600', marginTop: 8 },
});
