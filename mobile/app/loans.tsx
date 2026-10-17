import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { creditApi } from '../src/lib/api';
import { useI18n } from '../src/i18n';

const PURPOSES = ['SEED_AND_INPUTS', 'LAND_PREPARATION', 'LABOUR', 'EQUIPMENT', 'IRRIGATION', 'HARVEST_AND_TRANSPORT', 'WORKING_CAPITAL', 'OTHER'] as const;
const STATUS_KEY: Record<string, string> = {
  SUBMITTED: 'loanStatusSubmitted', UNDER_REVIEW: 'loanStatusUnderReview', APPROVED: 'loanStatusApproved',
  REJECTED: 'loanStatusRejected', DISBURSED: 'loanStatusDisbursed', WITHDRAWN: 'loanStatusWithdrawn',
};
const STATUS_COLOR: Record<string, string> = {
  SUBMITTED: '#3B82F6', UNDER_REVIEW: '#F59E0B', APPROVED: '#10B981', REJECTED: '#EF4444', DISBURSED: '#10B981', WITHDRAWN: '#9CA3AF',
};
const tzs = (n?: number | null) => (n == null ? '—' : `TZS ${Math.round(n).toLocaleString()}`);
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString() : '—');

interface Application {
  id: string; reference: string; status: string; amountRequested: number; approvedAmount: number | null; termMonths: number;
  purpose: string; createdAt: string; decisionNote: string | null; lender: { name: string };
  terms: { instalment: number };
}
interface Loan { id: string; reference: string | null; lender: string; original: number; outstanding: number; overdueAmount: number; nextDue: { dueDate: string; amount: number } | null }

export default function LoansScreen() {
  const { t } = useI18n();
  const [apps, setApps] = useState<Application[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [lenders, setLenders] = useState<{ id: string; name: string; interestRatePercent: number | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ lenderId: '', amount: '', months: '6', purpose: 'SEED_AND_INPUTS' as string, note: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, l, ln] = await Promise.all([creditApi.applications(), creditApi.loans(), creditApi.lenders()]);
      setApps(a.data ?? []);
      setLoans(l.data?.rows ?? []);
      setLenders(ln.data ?? []);
    } catch { /* offline: show what we have */ } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async () => {
    setBusy(true);
    try {
      await creditApi.submit({ lenderId: form.lenderId, amountRequested: Number(form.amount), termMonths: Number(form.months), purpose: form.purpose, purposeNote: form.note.trim() || undefined });
      setApplying(false);
      setForm({ lenderId: '', amount: '', months: '6', purpose: 'SEED_AND_INPUTS', note: '' });
      Alert.alert(t('applyForLoan'), t('loanApplicationSent'));
      load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('applyForLoan'), Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Error'));
    } finally { setBusy(false); }
  };

  const withdraw = (a: Application) =>
    Alert.alert(t('loanWithdraw'), t('loanWithdrawConfirm'), [
      { text: 'No', style: 'cancel' },
      { text: t('loanWithdraw'), style: 'destructive', onPress: async () => { try { await creditApi.withdraw(a.id); load(); } catch { /* ignore */ } } },
    ]);

  if (loading && !apps.length && !loans.length) {
    return <SafeAreaView style={styles.container} edges={['bottom']}><Stack.Screen options={{ headerShown: true, title: t('myLoans') }} /><View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('myLoans') }} />
      <ScrollView contentContainerStyle={styles.content}>
        {loans.filter((l) => l.outstanding > 0).map((l) => (
          <View key={l.id} style={styles.card}>
            <Text style={styles.cardTitle}>{l.lender}{l.reference ? ` · ${l.reference}` : ''}</Text>
            <Text style={styles.big}>{tzs(l.outstanding)}</Text>
            <Text style={styles.muted}>{t('loanOutstanding')}</Text>
            {l.nextDue && <Text style={styles.line}>{t('loanNextInstalment')}: {tzs(l.nextDue.amount)} · {day(l.nextDue.dueDate)}</Text>}
            {l.overdueAmount > 0 && <Text style={[styles.line, { color: '#EF4444' }]}>{t('loanOverdue')}: {tzs(l.overdueAmount)}</Text>}
          </View>
        ))}

        {!applying ? (
          <TouchableOpacity style={styles.primary} onPress={() => setApplying(true)}><Text style={styles.primaryText}>{t('applyForLoan')}</Text></TouchableOpacity>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('applyForLoan')}</Text>
            <Text style={styles.muted}>{t('loanShareNote')}</Text>
            <Text style={styles.label}>{t('loanLender')}</Text>
            <View style={styles.chips}>
              {lenders.map((l) => (
                <TouchableOpacity key={l.id} style={[styles.chip, form.lenderId === l.id && styles.chipOn]} onPress={() => setForm({ ...form, lenderId: l.id })}>
                  <Text style={[styles.chipText, form.lenderId === l.id && styles.chipTextOn]}>{l.name}{l.interestRatePercent != null ? ` · ${l.interestRatePercent}%` : ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t('loanAmountNeeded')}</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={form.amount} onChangeText={(v) => setForm({ ...form, amount: v.replace(/[^0-9]/g, '') })} />
            <Text style={styles.label}>{t('loanRepayMonths')}</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={form.months} onChangeText={(v) => setForm({ ...form, months: v.replace(/[^0-9]/g, '') })} />
            <Text style={styles.label}>{t('loanPurposeLabel')}</Text>
            <View style={styles.chips}>
              {PURPOSES.map((p) => (
                <TouchableOpacity key={p} style={[styles.chip, form.purpose === p && styles.chipOn]} onPress={() => setForm({ ...form, purpose: p })}>
                  <Text style={[styles.chipText, form.purpose === p && styles.chipTextOn]}>{t(`loanPurpose${p}` as any)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t('loanDetailsOptional')}</Text>
            <TextInput style={styles.input} value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={() => setApplying(false)}><Text style={styles.secondaryText}>✕</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, { flex: 3, marginTop: 0 }, (busy || !form.lenderId || !Number(form.amount) || !Number(form.months)) && { opacity: 0.5 }]} disabled={busy || !form.lenderId || !Number(form.amount) || !Number(form.months)} onPress={send}>
                <Text style={styles.primaryText}>{busy ? '…' : t('sendApplication')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <Text style={styles.section}>{t('loanApplications')}</Text>
        {apps.length === 0 && <Text style={styles.muted}>{t('noLoanApplications')}</Text>}
        {apps.map((a) => (
          <View key={a.id} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{a.reference}</Text>
              <Text style={[styles.status, { color: STATUS_COLOR[a.status] }]}>{t((STATUS_KEY[a.status] ?? 'loanStatusSubmitted') as any)}</Text>
            </View>
            <Text style={styles.line}>{a.lender.name} · {t(`loanPurpose${a.purpose}` as any)}</Text>
            <Text style={styles.line}>{tzs(a.amountRequested)} · {a.termMonths} · {day(a.createdAt)}</Text>
            {a.approvedAmount != null && <Text style={styles.line}>{t('loanApproved')}: {tzs(a.approvedAmount)} · {t('loanMonthlyInstalment')}: {tzs(a.terms.instalment)}</Text>}
            {!!a.decisionNote && <Text style={styles.muted}>{t('loanDecisionNote')}: {a.decisionNote}</Text>}
            {['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(a.status) && (
              <TouchableOpacity onPress={() => withdraw(a)}><Text style={styles.link}>{t('loanWithdraw')}</Text></TouchableOpacity>
            )}
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
  big: { fontSize: 24, fontWeight: '800', color: '#111827', marginTop: 4 },
  muted: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  line: { fontSize: 13, color: '#374151', marginTop: 4 },
  section: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 12, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  status: { fontSize: 12, fontWeight: '700' },
  label: { fontSize: 12, color: '#6B7280', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9999, borderWidth: 1, borderColor: '#D1D5DB' },
  chipOn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  primary: { backgroundColor: '#10B981', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4, marginBottom: 12 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondary: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB' },
  secondaryText: { color: '#374151', fontWeight: '700' },
  link: { color: '#EF4444', fontSize: 13, fontWeight: '600', marginTop: 8 },
});
