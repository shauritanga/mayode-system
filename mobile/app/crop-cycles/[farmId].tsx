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
  _count?: { activities: number; costs: number };
}

const statusColor: Record<string, string> = {
  PLANNED: '#9CA3AF', ACTIVE: '#10B981', HARVESTED: '#F59E0B', COMPLETED: '#3B82F6',
};

/** List of crop cycles (farming seasons) for a farm — the "Activities" home for a farm. */
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

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('cropCycles') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {!!farmCode && <Text style={styles.farmLabel}>{farmCode}</Text>}

        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => router.push({ pathname: '/crop-cycle-new', params: { farmId, farmCode } })}
        >
          <HugeiconsIcon icon={Add01Icon} size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.startBtnText}>{t('startCropCycle')}</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator color="#10B981" style={{ marginTop: 24 }} />
        ) : cycles.length === 0 ? (
          <View style={styles.empty}>
            <HugeiconsIcon icon={WheatIcon} size={40} color="#D1FAE5" strokeWidth={1.5} />
            <Text style={styles.emptyText}>{t('noCropCycles')}</Text>
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
                  {c.riceVariety || t('riceVariety')} · {c._count?.activities ?? 0} {t('activitiesTab').toLowerCase()}
                </Text>
              </View>
              <View style={[styles.statusPill, { backgroundColor: `${statusColor[c.status] || '#9CA3AF'}22` }]}>
                <Text style={[styles.statusText, { color: statusColor[c.status] || '#9CA3AF' }]}>{c.status}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  farmLabel: { fontSize: 18, fontWeight: '900', color: '#10B981', marginBottom: 12 },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#065F46', paddingVertical: 14, borderRadius: 14, marginBottom: 16 },
  startBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { alignItems: 'center', marginTop: 40, paddingHorizontal: 24 },
  emptyText: { color: '#6B7280', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  season: { fontSize: 15, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 3 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '800' },
});
