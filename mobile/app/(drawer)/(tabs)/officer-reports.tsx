import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { TaskDaily01Icon, FileAttachmentIcon } from '@hugeicons/core-free-icons';
import { officerVisitsApi, workspaceApi } from '../../../src/lib/data';
import { useI18n } from '../../../src/i18n';

export default function OfficerReportsScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [recentVisits, setRecentVisits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ctxRes, visitsRes] = await Promise.all([
        workspaceApi.context(),
        officerVisitsApi.mine({ pageSize: 10 }),
      ]);
      setMetrics(ctxRes.data?.metrics ?? {});
      setRecentVisits(visitsRes.data?.data ?? []);
    } catch {
      setMetrics({});
      setRecentVisits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={styles.intro}>{t('officerReportsIntro')}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{metrics.myFarmersCount ?? 0}</Text>
            <Text style={styles.statLabel}>{t('farmersManaged')}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{metrics.visitsThisWeek ?? 0}</Text>
            <Text style={styles.statLabel}>{t('visitsThisWeek')}</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statValue}>{metrics.pendingVerifications ?? 0}</Text>
            <Text style={styles.statLabel}>{t('pendingVerifications')}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>{t('recentVisits')}</Text>
        {recentVisits.length === 0 ? (
          <Text style={styles.emptyText}>{t('noVisitsYet')}</Text>
        ) : recentVisits.map((v: any) => (
          <View key={v.id} style={styles.row}>
            <View style={styles.rowHeader}>
              <HugeiconsIcon icon={TaskDaily01Icon} size={16} color="#047857" strokeWidth={2} />
              <Text style={styles.rowTitle}>{v.farmer?.firstName} {v.farmer?.lastName}</Text>
            </View>
            <Text style={styles.rowSub}>{v.purpose?.replace(/_/g, ' ')} · {new Date(v.visitedAt).toLocaleDateString()}</Text>
            {!!v.farm?.farmCode && (
              <TouchableOpacity
                style={styles.reportLink}
                onPress={() => router.push({ pathname: '/farm-report/[id]', params: { id: v.farm.id } })}
              >
                <HugeiconsIcon icon={FileAttachmentIcon} size={14} color="#3B82F6" strokeWidth={2} />
                <Text style={styles.reportLinkText}>{t('viewFarmReport')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: 13, color: '#6B7280', marginBottom: 16 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statTile: { backgroundColor: '#fff', borderRadius: 14, padding: 14, minWidth: '30%', flexGrow: 1, borderWidth: 1, borderColor: '#E5E7EB' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#047857' },
  statLabel: { fontSize: 11, color: '#6B7280', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  emptyText: { fontSize: 13, color: '#9CA3AF' },
  row: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rowSub: { fontSize: 12, color: '#6B7280', marginTop: 3, textTransform: 'capitalize' },
  reportLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  reportLinkText: { fontSize: 12, color: '#3B82F6', fontWeight: '700' },
});
