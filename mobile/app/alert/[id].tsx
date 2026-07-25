import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { SquareLock02Icon, CheckmarkCircle02Icon, Calendar03Icon, StarIcon } from '@hugeicons/core-free-icons';
import { alertsApi } from '../../src/lib/data';
import { useI18n, TranslationKey } from '../../src/i18n';
import { urgencyColor } from '../alerts';

interface AlertDetail {
  id: string;
  farmCode?: string;
  farmName?: string;
  category: string;
  urgency: string;
  title: string;
  previewMessage: string;
  status: string;
  locked: boolean;
  recommendation?: string | null;
  actionDetails?: string | null;
  expectedActionDate?: string | null;
  membershipCta?: string;
}

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t, language } = useI18n();
  const [alert, setAlert] = useState<AlertDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await alertsApi.getOne(id);
      setAlert(res.data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const complete = async () => {
    if (!alert || completing) return;
    setCompleting(true);
    try {
      await alertsApi.complete(alert.id);
      Alert.alert(t('farmAlerts'), t('alertCompleted'));
      await load();
    } catch (e: any) {
      Alert.alert(t('farmAlerts'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setCompleting(false);
    }
  };

  if (loading && !alert) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color="#10B981" size="large" /></SafeAreaView>;
  }
  if (!alert) {
    return <SafeAreaView style={styles.center}><Text>{t('alertDetail')}</Text></SafeAreaView>;
  }

  const done = alert.status === 'COMPLETED';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('alertDetail') }} />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
      >
        {/* Header — always visible (free preview) */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.category}>{t(`cat${alert.category}` as TranslationKey)}</Text>
            <View style={[styles.urgencyChip, { backgroundColor: urgencyColor(alert.urgency) + '22' }]}>
              <Text style={[styles.urgencyText, { color: urgencyColor(alert.urgency) }]}>
                {t(`urgency${alert.urgency}` as TranslationKey)}
              </Text>
            </View>
          </View>
          <Text style={styles.title}>{alert.title}</Text>
          {!!alert.farmCode && (
            <Text style={styles.farm}>{alert.farmCode}{alert.farmName ? ` · ${alert.farmName}` : ''}</Text>
          )}
          <Text style={styles.preview}>{alert.previewMessage}</Text>
        </View>

        {alert.locked ? (
          /* Free user — teaser + membership CTA (no premium content) */
          <View style={styles.lockedCard}>
            <View style={styles.lockedIconWrap}>
              <HugeiconsIcon icon={SquareLock02Icon} size={28} color="#B45309" strokeWidth={2} />
            </View>
            <Text style={styles.lockedTitle}>{t('alertLockedTitle')}</Text>
            <Text style={styles.lockedBody}>{alert.membershipCta}</Text>
            <TouchableOpacity style={styles.unlockBtn} onPress={() => router.push('/membership')}>
              <HugeiconsIcon icon={StarIcon} size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.unlockText}>{t('unlockRecommendation')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Member — full diagnosis, action plan, and completion */
          <>
            {!!alert.recommendation && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('recommendedAction')}</Text>
                <Text style={styles.body}>{alert.recommendation}</Text>
              </View>
            )}
            {!!alert.actionDetails && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('actionPlan')}</Text>
                <Text style={styles.body}>{alert.actionDetails}</Text>
              </View>
            )}
            {!!alert.expectedActionDate && (
              <View style={styles.dateRow}>
                <HugeiconsIcon icon={Calendar03Icon} size={16} color="#10B981" strokeWidth={2} />
                <Text style={styles.dateText}>
                  {t('actionBy')}: {new Date(alert.expectedActionDate).toLocaleDateString(language === 'sw' ? 'sw-TZ' : 'en-GB')}
                </Text>
              </View>
            )}
            {!done ? (
              <TouchableOpacity style={[styles.completeBtn, completing && { opacity: 0.6 }]} onPress={complete} disabled={completing}>
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} color="#fff" strokeWidth={2} />
                <Text style={styles.completeText}>{t('markCompleted')}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.doneChip}>
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="#10B981" strokeWidth={2} />
                <Text style={styles.doneText}>{t('statusCOMPLETED')}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase' },
  urgencyChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 },
  urgencyText: { fontSize: 11, fontWeight: '800' },
  title: { fontSize: 19, fontWeight: '900', color: '#111827', marginTop: 10 },
  farm: { fontSize: 13, fontWeight: '700', color: '#10B981', marginTop: 4 },
  preview: { fontSize: 14, color: '#4B5563', marginTop: 10, lineHeight: 21 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 8 },
  body: { fontSize: 14, color: '#374151', lineHeight: 22 },
  lockedCard: { backgroundColor: '#FFFBEB', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center' },
  lockedIconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(180,83,9,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  lockedTitle: { fontSize: 16, fontWeight: '900', color: '#92400E' },
  lockedBody: { fontSize: 14, color: '#92400E', textAlign: 'center', marginTop: 8, lineHeight: 21 },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F59E0B', paddingVertical: 13, paddingHorizontal: 20, borderRadius: 12, marginTop: 16 },
  unlockText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 12, padding: 14, marginBottom: 14 },
  dateText: { fontSize: 13, fontWeight: '700', color: '#065F46' },
  completeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14 },
  completeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  doneChip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(16,185,129,0.12)', paddingVertical: 14, borderRadius: 14 },
  doneText: { color: '#10B981', fontWeight: '800', fontSize: 14 },
});
