import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { insuranceApplicationsApi as api } from '../src/lib/api';
import { useI18n } from '../src/i18n';

const PRODUCTS = ['AREA_YIELD', 'WEATHER_INDEX', 'MULTI_PERIL', 'INPUT_INSURANCE', 'CREDIT_LINKED'] as const;
const STATUS_COLOR: Record<string, string> = { SUBMITTED: '#3B82F6', UNDER_REVIEW: '#F59E0B', APPROVED: '#10B981', REJECTED: '#EF4444', ACTIVATED: '#10B981', WITHDRAWN: '#9CA3AF' };
const RISK_COLOR: Record<string, string> = { LOW: '#10B981', MEDIUM: '#F59E0B', HIGH: '#EF4444' };
const tzs = (n?: number | null) => (n == null ? '—' : `TZS ${Math.round(n).toLocaleString()}`);
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

export default function InsuranceApplyScreen() {
  const { t } = useI18n();
  const [apps, setApps] = useState<any[]>([]);
  const [insurers, setInsurers] = useState<{ id: string; name: string }[]>([]);
  const [risk, setRisk] = useState<{ level: 'LOW' | 'MEDIUM' | 'HIGH'; factors: { label: string; detail: string }[] } | null>(null);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ providerId: '', product: 'MULTI_PERIL' as string, area: '', sum: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, i, r] = await Promise.all([api.list(), api.insurers(), api.risk()]);
      setApps(a.data ?? []); setInsurers(i.data ?? []); setRisk(r.data);
    } catch { /* offline */ } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const area = Number(form.area) || 0;
  useEffect(() => {
    if (!applying || area <= 0) { setSuggested(null); return; }
    let live = true;
    api.suggestion(form.product, area).then((r) => { if (live) setSuggested(r.data.suggestedSumInsured); }).catch(() => { if (live) setSuggested(null); });
    return () => { live = false; };
  }, [applying, form.product, area]);

  const send = async () => {
    setBusy(true);
    try {
      await api.submit({ providerId: form.providerId, productType: form.product, insuredAreaHectares: area, requestedSumInsured: Number(form.sum) || undefined });
      setApplying(false); setForm({ providerId: '', product: 'MULTI_PERIL', area: '', sum: '' });
      Alert.alert(t('applyForInsurance'), t('insuranceApplicationSent'));
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('applyForInsurance'), Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error'));
    } finally { setBusy(false); }
  };

  const withdraw = (a: any) => Alert.alert(t('loanWithdraw'), t('loanWithdrawConfirm'), [
    { text: 'No', style: 'cancel' },
    { text: t('loanWithdraw'), style: 'destructive', onPress: async () => { try { await api.withdraw(a.id); load(); } catch { /* ignore */ } } },
  ]);

  if (loading && !apps.length) {
    return <SafeAreaView style={styles.container} edges={['bottom']}><Stack.Screen options={{ headerShown: true, title: t('applyForInsurance') }} /><View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View></SafeAreaView>;
  }
  const ready = !busy && !!form.providerId && area > 0;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('applyForInsurance') }} />
      <ScrollView contentContainerStyle={styles.content}>
        {!applying ? (
          <TouchableOpacity style={styles.primary} onPress={() => setApplying(true)}><Text style={styles.primaryText}>{t('applyForInsurance')}</Text></TouchableOpacity>
        ) : (
          <View style={styles.card}>
            <Text style={styles.label}>{t('insuranceCoverLabel')}</Text>
            {PRODUCTS.map((p) => (
              <TouchableOpacity key={p} style={[styles.option, form.product === p && styles.optionOn]} onPress={() => setForm({ ...form, product: p })}>
                <Text style={[styles.optionText, form.product === p && { color: '#065F46', fontWeight: '700' }]}>{t(`insuranceProduct_${p}` as any)}</Text>
              </TouchableOpacity>
            ))}
            <Text style={styles.label}>{t('insurerLabel')}</Text>
            <View style={styles.chips}>
              {insurers.map((i) => (
                <TouchableOpacity key={i.id} style={[styles.chip, form.providerId === i.id && styles.chipOn]} onPress={() => setForm({ ...form, providerId: i.id })}>
                  <Text style={[styles.chipText, form.providerId === i.id && styles.chipTextOn]}>{i.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t('insuranceAreaHa')}</Text>
            <TextInput style={styles.input} keyboardType="decimal-pad" value={form.area} onChangeText={(v) => setForm({ ...form, area: v.replace(/[^0-9.]/g, '') })} />
            <Text style={styles.label}>{t('insuranceSumWanted')}</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={form.sum} onChangeText={(v) => setForm({ ...form, sum: v.replace(/[^0-9]/g, '') })} />
            {suggested != null && (
              <TouchableOpacity onPress={() => setForm({ ...form, sum: String(suggested) })}><Text style={styles.link}>{t('insuranceSuggested')}: {tzs(suggested)}</Text></TouchableOpacity>
            )}
            {risk && (
              <View style={{ marginTop: 12 }}>
                <Text style={styles.label}>{t('insuranceRiskLabel')}: <Text style={{ color: RISK_COLOR[risk.level], fontWeight: '700' }}>{t(`insuranceRisk${risk.level}` as any)}</Text></Text>
                {risk.factors.slice(0, 4).map((f) => <Text key={f.label} style={styles.muted}>• {f.label} — {f.detail}</Text>)}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={() => setApplying(false)}><Text style={styles.secondaryText}>✕</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, { flex: 3, marginTop: 0 }, !ready && { opacity: 0.5 }]} disabled={!ready} onPress={send}><Text style={styles.primaryText}>{busy ? '…' : t('sendApplication')}</Text></TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.section}>{t('insuranceApplications')}</Text>
        {apps.length === 0 && <Text style={styles.muted}>{t('noInsuranceApplications')}</Text>}
        {apps.map((a) => (
          <View key={a.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{a.reference}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: STATUS_COLOR[a.status] }}>{t(`insuranceStatus${a.status}` as any)}</Text>
            </View>
            <Text style={styles.line}>{a.provider?.name} · {String(a.productType).replace(/_/g, ' ').toLowerCase()} · {a.insuredAreaHectares} ha</Text>
            <Text style={styles.muted}>{day(a.createdAt)}</Text>
            {a.sumInsured != null && <Text style={styles.line}>{t('insuranceOffer')}: {tzs(a.sumInsured)} · {t('insurancePremiumDue')}: {tzs(a.premiumAmount)}</Text>}
            {!!a.decisionNote && <Text style={styles.muted}>{t('loanDecisionNote')}: {a.decisionNote}</Text>}
            {['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(a.status) && <TouchableOpacity onPress={() => withdraw(a)}><Text style={[styles.link, { color: '#EF4444' }]}>{t('loanWithdraw')}</Text></TouchableOpacity>}
          </View>
        ))}
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
  section: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 12, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 12, color: '#6B7280', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff' },
  option: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10, marginBottom: 6 },
  optionOn: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  optionText: { fontSize: 13, color: '#374151' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999, borderWidth: 1, borderColor: '#D1D5DB' },
  chipOn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  primary: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 12 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB' },
  secondaryText: { color: '#374151', fontWeight: '700' },
  link: { color: '#10B981', fontSize: 13, fontWeight: '600', marginTop: 8 },
});
