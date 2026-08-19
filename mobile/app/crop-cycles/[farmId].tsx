import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Add01Icon, WheatIcon } from '@hugeicons/core-free-icons';
import { cropCyclesApi } from '../../src/lib/data';
import { useI18n } from '../../src/i18n';

interface CropCycle {
  id: string;
  season: string;
  riceVariety?: string;
  status: string;
  plantingDate?: string;
  expectedHarvest?: string;
  _count?: { activities: number; costs: number; revenues?: number };
}

const statusColor: Record<string, string> = {
  PLANNED: '#9CA3AF', ACTIVE: '#10B981', HARVESTED: '#F59E0B', COMPLETED: '#3B82F6',
};

/** List of crop cycles for a farm — gateway to activities, expenses, and sales. */
export default function CropCyclesList() {
  const { farmId, farmCode } = useLocalSearchParams<{ farmId: string; farmCode?: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [cycles, setCycles] = useState<CropCycle[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const res = await cropCyclesApi.getByFarmId(farmId);
      setCycles(res.data || []);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const startCycle = () => {
    router.push({ pathname: '/crop-cycle-new', params: { farmId, farmCode } });
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('seasonRecords') }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!!farmCode && <Text style={styles.farmLabel}>{farmCode}</Text>}
        <Text style={styles.listHint}>{t('seasonRecordsHint')}</Text>

        {loading ? (
          <ActivityIndicator color="#10B981" style={{ marginTop: 24 }} />
        ) : cycles.length === 0 ? (
          <View style={styles.empty}>
            <HugeiconsIcon icon={WheatIcon} size={40} color="#D1FAE5" strokeWidth={1.5} />
            <Text style={styles.emptyText}>{t('noCropCycles')}</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={startCycle} activeOpacity={0.85}>
              <Text style={styles.emptyBtnText}>{t('startCropCycle')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          cycles.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.card}
              onPress={() => router.push({ pathname: '/crop-cycle/[id]', params: { id: c.id, farmCode } })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.season}>{c.season}</Text>
                <Text style={styles.sub}>
                  {c.riceVariety || t('riceVariety')}
                </Text>
                <Text style={styles.meta}>
                  {c._count?.activities ?? 0} {t('activitiesTab').toLowerCase()}
                  {' · '}
                  {c._count?.costs ?? 0} {t('expensesTab').toLowerCase()}
                  {' · '}
                  {c._count?.revenues ?? 0} {t('salesTab').toLowerCase()}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: `${statusColor[c.status] || '#9CA3AF'}22` }]}>
                <Text style={[styles.statusText, { color: statusColor[c.status] || '#9CA3AF' }]}>{c.status}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {!loading && cycles.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={startCycle}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('startCropCycle')}
        >
          <HugeiconsIcon icon={Add01Icon} size={26} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollContent: { padding: 16, paddingBottom: 110 },
  farmLabel: { fontSize: 18, fontWeight: '900', color: '#10B981', marginBottom: 6 },
  listHint: { fontSize: 13, color: '#6B7280', lineHeight: 19, marginBottom: 14 },
  empty: { alignItems: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyText: { color: '#6B7280', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  emptyBtn: {
    backgroundColor: '#065F46',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginTop: 22,
  },
  emptyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  season: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  meta: { fontSize: 12, color: '#059669', fontWeight: '600', marginTop: 6 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '800' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#065F46',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#065F46',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
});
