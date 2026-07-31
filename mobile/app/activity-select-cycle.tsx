import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { WheatIcon, Tree02Icon } from '@hugeicons/core-free-icons';
import { farmsApi, cropCyclesApi, workspaceApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';

interface Option {
  cropCycleId: string;
  farmId: string;
  farmCode: string;
  season: string;
}

const ACTIVE_STATUSES = ['PLANNED', 'ACTIVE'];

export default function ActivitySelectCycle() {
  const router = useRouter();
  const { t } = useI18n();
  const farmerId = useAuthStore((state) => state.farmerId);
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!farmerId) { setLoading(false); return; }
      try {
        const [ownedRes, assignmentsRes] = await Promise.all([
          farmsApi.getByFarmerId(farmerId),
          workspaceApi.context().catch(() => ({ data: {} })),
        ]);
        const owned = ownedRes.data?.data || ownedRes.data || [];
        const assignments = assignmentsRes.data?.activeAssignments ?? [];
        const assignedFarms = assignments.map((a: any) => a.farm).filter(Boolean);
        const farmsById = new Map<string, any>();
        [...owned, ...assignedFarms].forEach((f: any) => farmsById.set(f.id, f));

        const perFarm = await Promise.all(
          Array.from(farmsById.values()).map((farm) =>
            cropCyclesApi.getByFarmId(farm.id).then((res) => {
              const cycles = res.data?.data || res.data || [];
              return cycles
                .filter((c: any) => ACTIVE_STATUSES.includes(c.status))
                .map((c: any) => ({ cropCycleId: c.id, farmId: farm.id, farmCode: farm.farmCode, season: c.season }));
            }).catch(() => []),
          ),
        );
        const flat = perFarm.flat();
        setOptions(flat);

        if (flat.length === 1) {
          router.replace({
            pathname: '/activity-new',
            params: { cropCycleId: flat[0].cropCycleId, farmId: flat[0].farmId, farmCode: flat[0].farmCode, season: flat[0].season },
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [farmerId]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('selectCropCycleTitle') }} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : options.length === 0 ? (
        <View style={styles.center}>
          <HugeiconsIcon icon={Tree02Icon} size={56} color="#D1FAE5" strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>{t('noActiveCropCyclesTitle')}</Text>
          <Text style={styles.emptySubtitle}>{t('noActiveCropCyclesSubtitle')}</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={() => router.replace('/(tabs)/farms')}>
            <Text style={styles.emptyBtnText}>{t('goToFarms')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Text style={styles.subtitle}>{t('selectCropCycleSubtitle')}</Text>
          {options.map((o) => (
            <TouchableOpacity
              key={o.cropCycleId}
              style={styles.row}
              onPress={() => router.replace({
                pathname: '/activity-new',
                params: { cropCycleId: o.cropCycleId, farmId: o.farmId, farmCode: o.farmCode, season: o.season },
              })}
            >
              <View style={styles.icon}><HugeiconsIcon icon={WheatIcon} size={20} color="#10B981" strokeWidth={2} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{o.farmCode}</Text>
                <Text style={styles.rowSubtitle}>{o.season}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 18 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  emptyBtn: {
    backgroundColor: '#10B981', paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 14, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  emptyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB',
  },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  rowSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
