import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { SquareLock02Icon, CheckmarkCircle02Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { farmersApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';

interface Factor { score: number; max: number; [key: string]: any }

const FACTOR_LABELS: Record<string, string> = {
  verification: 'verificationFactor',
  production: 'productionFactor',
  profitability: 'profitabilityFactor',
  loanRepayment: 'loanRepaymentFactor',
  cooperativeMembership: 'cooperativeMembershipFactor',
  experience: 'experienceFactor',
};

export default function FinancesScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const { farmerId } = useAuthStore();

  const [financial, setFinancial] = useState<any>(null);
  const [credit, setCredit] = useState<any>(null);
  const [production, setProduction] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!farmerId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [finRes, credRes, prodRes] = await Promise.all([
        farmersApi.financialSummary(farmerId),
        farmersApi.creditReadiness(farmerId),
        farmersApi.productionSummary(farmerId),
      ]);
      setFinancial(finRes.data);
      setCredit(credRes.data);
      setProduction(prodRes.data);
    } finally {
      setLoading(false);
    }
  }, [farmerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: t('finances') }} />
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('finances') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {financial?.locked ? (
          <View style={styles.lockedCard}>
            <View style={styles.lockedHeader}>
              <HugeiconsIcon icon={SquareLock02Icon} size={20} color="#B45309" strokeWidth={2} />
              <Text style={styles.lockedTitle}>{t('premiumLocked')}</Text>
            </View>
            <Text style={styles.lockedMsg}>{financial.message || t('membershipCta')}</Text>
            <TouchableOpacity style={styles.unlockBtn} onPress={() => router.push('/membership')}>
              <Text style={styles.unlockBtnText}>{t('viewPlans')}</Text>
            </TouchableOpacity>
          </View>
        ) : financial?.overallFinancials && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('finances')}</Text>
            <View style={styles.grid}>
              <Stat label={t('totalCosts')} value={financial.overallFinancials.overallCosts} />
              <Stat label={t('totalRevenues')} value={financial.overallFinancials.overallRevenues} />
              <Stat label={t('fairtradePremium')} value={financial.overallFinancials.overallFairtradePremium} />
              <Stat label={t('netProfit')} value={financial.overallFinancials.overallNetProfit} highlight />
            </View>
            <View style={[styles.badge, financial.overallFinancials.isProfitable ? styles.badgeGreen : styles.badgeGold]}>
              <Text style={[styles.badgeText, financial.overallFinancials.isProfitable ? styles.badgeTextGreen : styles.badgeTextGold]}>
                {financial.overallFinancials.isProfitable ? t('profitable') : t('notProfitable')}
              </Text>
            </View>
          </View>
        )}

        {!!credit && (
          <View style={styles.card}>
            <View style={styles.creditHeader}>
              <View>
                <Text style={styles.sectionTitle}>{t('creditScore')}</Text>
                <Text style={styles.creditScore}>{credit.creditScore}</Text>
              </View>
              <HugeiconsIcon
                icon={credit.creditReady ? CheckmarkCircle02Icon : Cancel01Icon}
                size={22}
                color={credit.creditReady ? '#10B981' : '#DC2626'}
                strokeWidth={2}
              />
            </View>
            <Text style={[styles.creditReadyText, { color: credit.creditReady ? '#10B981' : '#DC2626' }]}>
              {credit.creditReady ? t('creditReady') : t('notCreditReady')}
            </Text>
            {Object.entries(credit.factors ?? {}).map(([key, f]) => (
              <View key={key} style={styles.factorRow}>
                <Text style={styles.factorLabel}>{t(FACTOR_LABELS[key] as any)}</Text>
                <Text style={styles.factorValue}>{(f as Factor).score}/{(f as Factor).max}</Text>
              </View>
            ))}
          </View>
        )}

        {!!production && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('productionSummary')}</Text>
            <View style={styles.grid}>
              <Stat label={t('totalCropCycles')} value={production.totalCropCycles} raw />
              <Stat label={t('harvestedCycles')} value={production.harvestedCycles} raw />
              <Stat label={t('totalYield')} value={production.totalActualYieldKg} raw unit=" kg" />
              <Stat label={t('yieldAccuracy')} value={production.yieldAccuracy != null ? `${Math.round(production.yieldAccuracy * 100)}%` : '—'} raw />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value, highlight, raw, unit }: { label: string; value: any; highlight?: boolean; raw?: boolean; unit?: string }) {
  const display = raw ? `${value ?? '—'}${unit ?? ''}` : `${Number(value ?? 0).toLocaleString()} TZS`;
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, highlight && { color: '#047857' }]}>{display}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, minWidth: '46%', flexGrow: 1 },
  statValue: { fontSize: 17, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  badge: { alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, marginTop: 12 },
  badgeGreen: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  badgeGold: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextGreen: { color: '#10B981' },
  badgeTextGold: { color: '#F59E0B' },
  creditHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  creditScore: { fontSize: 28, fontWeight: '900', color: '#047857', marginTop: 2 },
  creditReadyText: { fontSize: 13, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  factorRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  factorLabel: { fontSize: 13, color: '#374151' },
  factorValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  lockedCard: { backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
  lockedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  lockedTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  lockedMsg: { fontSize: 13, color: '#92400E', marginTop: 4, lineHeight: 19 },
  unlockBtn: { backgroundColor: '#B45309', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  unlockBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
