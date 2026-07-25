import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
  Modal, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { CheckmarkCircle02Icon, StarIcon, SmartPhone01Icon } from '@hugeicons/core-free-icons';
import { membershipsApi, seasonsApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';

interface Plan {
  id: string;
  name: string;
  description?: string;
  priceTzs: number;
  features?: string[];
}
interface MembershipInfo {
  active: boolean;
  membership: {
    id: string;
    status: string;
    endDate?: string;
    plan?: { name: string };
    farmingSeason?: { name: string };
  } | null;
}
interface Season { id: string; name: string }

type PayPhase = 'phone' | 'pending';

export default function MembershipScreen() {
  const { t, language } = useI18n();
  const accountPhone = useAuthStore((s) => s.user?.phone);
  const [info, setInfo] = useState<MembershipInfo | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [season, setSeason] = useState<Season | null>(null);
  const [loading, setLoading] = useState(true);

  // Payment modal state
  const [payPlan, setPayPlan] = useState<Plan | null>(null);
  const [payPhase, setPayPhase] = useState<PayPhase>('phone');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [me, pl, se] = await Promise.allSettled([
        membershipsApi.me(),
        membershipsApi.plans(),
        seasonsApi.current(),
      ]);
      if (me.status === 'fulfilled') setInfo(me.value.data);
      if (pl.status === 'fulfilled') setPlans(pl.value.data ?? []);
      if (se.status === 'fulfilled') setSeason(se.value.data ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Clean up the poll timer if the screen unmounts mid-payment.
  useEffect(() => stopPolling, [stopPolling]);

  const openPay = (plan: Plan) => {
    setPayPlan(plan);
    setPhone(accountPhone ?? '');
    setPayPhase('phone');
  };

  const closePay = () => {
    stopPolling();
    setPayPlan(null);
    setSubmitting(false);
  };

  const activated = useCallback(async () => {
    stopPolling();
    setPayPlan(null);
    setSubmitting(false);
    await load();
    Alert.alert(t('membership'), t('membershipActive'));
  }, [load, stopPolling, t]);

  // Poll the backend after a mobile-money push until the payment clears.
  const startPolling = useCallback(() => {
    stopPolling();
    let ticks = 0;
    pollRef.current = setInterval(async () => {
      ticks += 1;
      try {
        const res = await membershipsApi.reconcile();
        if (res.data?.active) { await activated(); return; }
        if (res.data?.paymentStatus === 'FAILED') {
          stopPolling();
          setPayPhase('phone');
          Alert.alert(t('membership'), t('paymentFailed'));
          return;
        }
      } catch { /* transient — keep polling */ }
      if (ticks >= 30) { stopPolling(); } // ~2 min at 4s
    }, 4000);
  }, [activated, stopPolling, t]);

  const pay = async () => {
    if (!payPlan || submitting) return;
    const trimmed = phone.trim();
    if (!/^\+?[0-9]{9,15}$/.test(trimmed)) {
      Alert.alert(t('membership'), t('enterValidPhone'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await membershipsApi.start({
        planId: payPlan.id,
        farmingSeasonId: season?.id,
        phoneNumber: trimmed,
      });
      if (res.data?.paymentProvider === 'clickpesa') {
        setPayPhase('pending');
        startPolling();
      } else {
        // Manual/admin-approval fallback (ClickPesa not configured).
        closePay();
        Alert.alert(t('membership'), res.data?.message || t('membershipStarted'));
        await load();
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('membership'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  const checkNow = async () => {
    try {
      const res = await membershipsApi.reconcile();
      if (res.data?.active) await activated();
      else Alert.alert(t('membership'), t('paymentTimedOut'));
    } catch (e: any) {
      Alert.alert(t('membership'), String(e?.message ?? e));
    }
  };

  const status = info?.membership?.status;
  const isPending = status === 'PAYMENT_PENDING' || status === 'PENDING';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('membership') }} />
      {loading && !info ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
        >
          {/* Status card */}
          <View style={[styles.statusCard, info?.active && styles.statusCardActive]}>
            <View style={styles.statusRow}>
              <HugeiconsIcon
                icon={info?.active ? CheckmarkCircle02Icon : StarIcon}
                size={26}
                color={info?.active ? '#10B981' : '#F59E0B'}
                strokeWidth={2}
              />
              <View style={{ marginLeft: 10, flex: 1 }}>
                <Text style={styles.statusTitle}>
                  {info?.active
                    ? t('membershipActive')
                    : isPending
                      ? t('membershipPending')
                      : t('membershipInactive')}
                </Text>
                {info?.membership?.plan?.name && (
                  <Text style={styles.statusSub}>{info.membership.plan.name}</Text>
                )}
                {info?.active && info.membership?.endDate && (
                  <Text style={styles.statusSub}>
                    {t('validUntil')}: {new Date(info.membership.endDate).toLocaleDateString(language === 'sw' ? 'sw-TZ' : 'en-GB')}
                  </Text>
                )}
              </View>
            </View>
            <Text style={styles.seasonText}>
              {t('currentSeason')}: {season?.name ?? t('noCurrentSeason')}
            </Text>
          </View>

          {/* Plans */}
          <Text style={styles.sectionTitle}>{t('membershipPlans')}</Text>
          <Text style={styles.sectionSub}>{t('membershipPlansSubtitle')}</Text>

          {plans.map((plan) => (
            <View key={plan.id} style={styles.planCard}>
              <View style={styles.planHeader}>
                <Text style={styles.planName}>{plan.name}</Text>
                <View style={styles.priceChip}>
                  <Text style={styles.priceText}>TZS {plan.priceTzs.toLocaleString()}</Text>
                  <Text style={styles.priceUnit}>{t('perSeason')}</Text>
                </View>
              </View>
              {!!plan.description && <Text style={styles.planDesc}>{plan.description}</Text>}
              {(plan.features ?? []).map((f) => (
                <View key={f} style={styles.featureRow}>
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} color="#10B981" strokeWidth={2} />
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
              {!info?.active && !isPending && (
                <TouchableOpacity style={styles.activateBtn} onPress={() => openPay(plan)}>
                  <Text style={styles.activateText}>{t('activateMembership')}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Payment modal: phone entry → mobile-money pending/poll */}
      <Modal visible={!!payPlan} transparent animationType="slide" onRequestClose={closePay}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {payPhase === 'phone' ? (
              <>
                <Text style={styles.modalTitle}>{t('payWithMobileMoney')}</Text>
                {!!payPlan && (
                  <Text style={styles.modalPlan}>
                    {payPlan.name} · TZS {payPlan.priceTzs.toLocaleString()}
                  </Text>
                )}
                <Text style={styles.modalLabel}>{t('mobileMoneyNumber')}</Text>
                <TextInput
                  style={styles.modalInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+255712345678"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  autoFocus
                />
                <Text style={styles.modalHint}>{t('mobileMoneyHint')}</Text>
                <TouchableOpacity
                  style={[styles.payBtn, submitting && { opacity: 0.6 }]}
                  onPress={pay}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.payBtnText}>{t('payAmount', { amount: (payPlan?.priceTzs ?? 0).toLocaleString() })}</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={closePay}>
                  <Text style={styles.cancelText}>{t('cancel')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.pendingIconWrap}>
                  <HugeiconsIcon icon={SmartPhone01Icon} size={40} color="#10B981" strokeWidth={1.8} />
                </View>
                <Text style={styles.modalTitle}>{t('paymentPromptSent')}</Text>
                <Text style={styles.modalBody}>{t('paymentPromptBody')}</Text>
                <View style={styles.checkingRow}>
                  <ActivityIndicator color="#10B981" />
                  <Text style={styles.checkingText}>{t('checkingPayment')}</Text>
                </View>
                <TouchableOpacity style={styles.payBtn} onPress={checkNow}>
                  <Text style={styles.payBtnText}>{t('ivePaid')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={closePay}>
                  <Text style={styles.cancelText}>{t('cancel')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 18,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  statusCardActive: { borderColor: '#A7F3D0', backgroundColor: '#F0FDF9' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusTitle: { fontSize: 16, fontWeight: '900', color: '#111827' },
  statusSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  seasonText: { fontSize: 12, color: '#6B7280', marginTop: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  sectionSub: { fontSize: 13, color: '#6B7280', marginTop: 4, marginBottom: 12, lineHeight: 19 },
  planCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: 16, fontWeight: '900', color: '#065F46', flex: 1 },
  priceChip: { alignItems: 'flex-end' },
  priceText: { fontSize: 15, fontWeight: '900', color: '#10B981' },
  priceUnit: { fontSize: 11, color: '#6B7280' },
  planDesc: { fontSize: 13, color: '#4B5563', marginTop: 6, lineHeight: 19 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  featureText: { fontSize: 13, color: '#374151', flex: 1 },
  activateBtn: {
    backgroundColor: '#10B981', paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 14,
  },
  activateText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  // Payment modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 32 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#111827', textAlign: 'center' },
  modalPlan: { fontSize: 14, fontWeight: '700', color: '#065F46', textAlign: 'center', marginTop: 4 },
  modalBody: { fontSize: 14, color: '#4B5563', textAlign: 'center', marginTop: 10, lineHeight: 21 },
  modalLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 18, marginBottom: 6 },
  modalInput: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: '#111827' },
  modalHint: { fontSize: 12, color: '#6B7280', marginTop: 8, lineHeight: 18 },
  payBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 18 },
  payBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  cancelText: { color: '#6B7280', fontWeight: '700', fontSize: 14 },
  pendingIconWrap: { alignSelf: 'center', width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  checkingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16 },
  checkingText: { fontSize: 13, color: '#10B981', fontWeight: '700' },
});
