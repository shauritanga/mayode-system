import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { SquareLock02Icon, StarIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { farmsApi } from '../../src/lib/data';
import { useI18n } from '../../src/i18n';

interface Report {
  locked: boolean;
  farmCode: string;
  name: string;
  location: string;
  sizeHectares: number;
  sizeAcres: number;
  grade: string;
  photoCount: number;
  message?: string;
  condition?: string;
  potentialYieldKg?: number;
  actualYieldKg?: number;
  estimatedValueTzs?: number;
  soil?: any;
  roadAccess?: any;
  waterAccess?: any;
  recommendations?: string[];
}

export default function FarmReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await farmsApi.report(id);
      setReport(res.data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !report) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color="#10B981" size="large" /></SafeAreaView>;
  }
  if (!report) {
    return <SafeAreaView style={styles.center}><Text>{t('farmReport')}</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('farmReport') }} />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
      >
        {/* Header — always visible */}
        <View style={styles.card}>
          <Text style={styles.farmCode}>{report.farmCode}</Text>
          <Text style={styles.name}>{report.name}</Text>
          {!!report.location && <Text style={styles.location}>{report.location}</Text>}
          <Text style={styles.sub}>
            {report.sizeHectares} ha · {report.sizeAcres} ac · {t('gradeValue', { grade: report.grade })}
          </Text>
        </View>

        {report.locked ? (
          <View style={styles.lockedCard}>
            <View style={styles.lockIcon}>
              <HugeiconsIcon icon={SquareLock02Icon} size={28} color="#B45309" strokeWidth={2} />
            </View>
            <Text style={styles.lockedTitle}>{t('reportLockedTitle')}</Text>
            <Text style={styles.lockedBody}>{report.message}</Text>
            <TouchableOpacity style={styles.unlockBtn} onPress={() => router.push('/membership')}>
              <HugeiconsIcon icon={StarIcon} size={16} color="#fff" strokeWidth={2} />
              <Text style={styles.unlockText}>{t('viewPlans')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Section title={t('yieldAndValue')}>
              <Row label={t('potentialYield')} value={`${report.potentialYieldKg?.toLocaleString()} kg`} />
              <Row label={t('recordedYield')} value={`${(report.actualYieldKg ?? 0).toLocaleString()} kg`} />
              <Row label={t('estimatedValue')} value={`TZS ${report.estimatedValueTzs?.toLocaleString()}`} />
              <Row label={t('farmCondition')} value={report.condition ?? '—'} />
            </Section>

            <Section title={t('soilData')}>
              {report.soil ? (
                <>
                  {report.soil.ph != null && <Row label={t('soilPh')} value={`${report.soil.ph}`} />}
                  {!!report.soil.texture && <Row label="Texture" value={report.soil.texture} />}
                  {!!report.soil.condition && <Row label="Condition" value={report.soil.condition} />}
                  {!!report.soil.type && <Row label="Type" value={report.soil.type} />}
                </>
              ) : <Text style={styles.muted}>{t('noSoilData')}</Text>}
            </Section>

            <Section title={t('roadAccess')}>
              {report.roadAccess?.distanceMeters != null
                ? <Row label={t('distanceToRoad')} value={t('metersAway', { value: report.roadAccess.distanceMeters })} />
                : <Row label={t('roadAccess')} value={report.roadAccess?.nearRoad ? t('yes') : t('no')} />}
              {!!report.roadAccess?.quality && <Row label="Quality" value={report.roadAccess.quality} />}
            </Section>

            <Section title={t('waterAccess')}>
              {!!report.waterAccess?.source && <Row label="Source" value={report.waterAccess.source} />}
              {report.waterAccess?.distanceMeters != null && <Row label={t('waterAccess')} value={t('metersAway', { value: report.waterAccess.distanceMeters })} />}
              {!!report.waterAccess?.reliability && <Row label="Reliability" value={report.waterAccess.reliability} />}
              {report.waterAccess?.hasIrrigation != null && <Row label="Irrigation" value={report.waterAccess.hasIrrigation ? t('yes') : t('no')} />}
            </Section>

            {!!report.recommendations?.length && (
              <Section title={t('recommendations')}>
                {report.recommendations.map((rec, i) => (
                  <View key={i} style={styles.recRow}>
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="#10B981" strokeWidth={2} />
                    <Text style={styles.recText}>{rec}</Text>
                  </View>
                ))}
              </Section>
            )}

            <Text style={styles.disclaimer}>{t('reportDisclaimer')}</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  farmCode: { fontSize: 20, fontWeight: '900', color: '#10B981' },
  name: { fontSize: 16, fontWeight: '800', color: '#111827', marginTop: 2 },
  location: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  sub: { fontSize: 13, color: '#374151', marginTop: 6, fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 13, color: '#6B7280' },
  rowValue: { fontSize: 14, color: '#111827', fontWeight: '700', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  muted: { fontSize: 13, color: '#9CA3AF' },
  recRow: { flexDirection: 'row', gap: 8, paddingVertical: 5, alignItems: 'flex-start' },
  recText: { fontSize: 13, color: '#374151', flex: 1, lineHeight: 19 },
  disclaimer: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 4, marginBottom: 16 },
  lockedCard: { backgroundColor: '#FFFBEB', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center' },
  lockIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(180,83,9,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  lockedTitle: { fontSize: 16, fontWeight: '900', color: '#92400E' },
  lockedBody: { fontSize: 14, color: '#92400E', textAlign: 'center', marginTop: 8, lineHeight: 21 },
  unlockBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F59E0B', paddingVertical: 13, paddingHorizontal: 20, borderRadius: 12, marginTop: 16 },
  unlockText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
