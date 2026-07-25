import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Agreement01Icon } from '@hugeicons/core-free-icons';
import { leasesApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n } from '../src/i18n';

interface Lease {
  id: string;
  status: string;
  renterConfirmationStatus: string;
  renterName?: string;
  renterPhone: string;
  ownerFarmerId?: string;
  renterFarmerId?: string;
  leaseStartDate: string;
  leaseEndDate: string;
  farm?: { id: string; farmCode: string; name?: string };
  farmingSeason?: { id: string; name: string };
  ownerFarmer?: { firstName: string; lastName: string };
  renterFarmer?: { firstName: string; lastName: string };
}

export default function LeasesScreen() {
  const { t } = useI18n();
  const farmerId = useAuthStore((s) => s.farmerId);
  const [items, setItems] = useState<Lease[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await leasesApi.mine();
      setItems(res.data ?? []);
    } catch {
      /* keep previous list */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const respond = async (lease: Lease, confirm: boolean) => {
    setBusyId(lease.id);
    try {
      if (confirm) await leasesApi.renterConfirm(lease.id);
      else await leasesApi.renterReject(lease.id);
      Alert.alert(t('myLeases'), confirm ? t('leaseConfirmed') : t('leaseRejected'));
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('myLeases'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  const statusLabel = (s: string) =>
    s === 'ACTIVE' ? t('leaseActive')
      : s === 'PENDING_VERIFICATION' ? t('leasePending')
        : t('leaseTerminated');

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('myLeases') }} />
      {loading && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => l.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <HugeiconsIcon icon={Agreement01Icon} size={44} color="#D1FAE5" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t('noLeases')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            // The current user is the renter when their farmer id matches the lease's renter.
            const isRenter = !!farmerId && item.renterFarmerId === farmerId;
            const canRespond = isRenter && item.status === 'PENDING_VERIFICATION';
            return (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.farmCode}>{item.farm?.farmCode ?? '—'}</Text>
                  <View style={[
                    styles.statusChip,
                    item.status === 'ACTIVE' ? styles.chipGreen
                      : item.status === 'PENDING_VERIFICATION' ? styles.chipGold : styles.chipGray,
                  ]}>
                    <Text style={styles.statusChipText}>{statusLabel(item.status)}</Text>
                  </View>
                </View>
                {!!item.farm?.name && <Text style={styles.farmName}>{item.farm.name}</Text>}
                <Text style={styles.roleTag}>{isRenter ? t('asRenter') : t('asOwner')}</Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('seasonLabel')}</Text>
                  <Text style={styles.detailValue}>{item.farmingSeason?.name ?? '—'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('leaseStart')}</Text>
                  <Text style={styles.detailValue}>{String(item.leaseStartDate).slice(0, 10)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{t('leaseEnd')}</Text>
                  <Text style={styles.detailValue}>{String(item.leaseEndDate).slice(0, 10)}</Text>
                </View>
                {!isRenter && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{t('renterName')}</Text>
                    <Text style={styles.detailValue}>
                      {item.renterFarmer
                        ? `${item.renterFarmer.firstName} ${item.renterFarmer.lastName}`
                        : item.renterName || item.renterPhone}
                    </Text>
                  </View>
                )}

                {canRespond && (
                  <>
                    <Text style={styles.confirmPrompt}>{t('leaseConfirmPrompt')}</Text>
                    <View style={styles.actions}>
                      <TouchableOpacity
                        style={[styles.confirmBtn, busyId === item.id && { opacity: 0.6 }]}
                        onPress={() => respond(item, true)}
                        disabled={busyId === item.id}
                      >
                        <Text style={styles.confirmBtnText}>{t('leaseConfirm')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.rejectBtn, busyId === item.id && { opacity: 0.6 }]}
                        onPress={() => respond(item, false)}
                        disabled={busyId === item.id}
                      >
                        <Text style={styles.rejectBtnText}>{t('leaseReject')}</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  farmCode: { fontSize: 17, fontWeight: '900', color: '#10B981' },
  farmName: { fontSize: 13, color: '#374151', marginTop: 2 },
  roleTag: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginTop: 6, textTransform: 'uppercase' },
  statusChip: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  statusChipText: { fontSize: 11, fontWeight: '800' },
  chipGreen: { backgroundColor: 'rgba(16,185,129,0.15)' },
  chipGold: { backgroundColor: 'rgba(245,158,11,0.15)' },
  chipGray: { backgroundColor: '#F3F4F6' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  detailLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  detailValue: { fontSize: 13, color: '#111827', fontWeight: '700' },
  confirmPrompt: { fontSize: 13, color: '#065F46', marginTop: 14, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  confirmBtn: { flex: 1, backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: '#EF4444', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  rejectBtnText: { color: '#EF4444', fontWeight: '800', fontSize: 14 },
});
