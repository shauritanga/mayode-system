import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { GiftIcon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { rewardsApi } from '../src/lib/data';
import { useI18n, TranslationKey } from '../src/i18n';

interface RewardWin {
  id: string;
  rewardType: string;
  quantity: number;
  status: string;
  campaign?: { id: string; name: string; sponsor?: string };
}

export default function RewardsScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<RewardWin[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await rewardsApi.mine();
      setItems(res.data ?? []);
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirm = async (w: RewardWin) => {
    setBusyId(w.id);
    try {
      await rewardsApi.confirmReceipt(w.id);
      Alert.alert(t('rewards'), t('receiptConfirmed'));
      await load();
    } catch (e: any) {
      Alert.alert(t('rewards'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('myRewards') }} />
      {loading && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(w) => w.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <HugeiconsIcon icon={GiftIcon} size={44} color="#D1FAE5" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t('noRewards')}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const done = item.status === 'CONFIRMED';
            return (
              <View style={styles.card}>
                <View style={styles.ribbon}>
                  <HugeiconsIcon icon={GiftIcon} size={22} color="#fff" strokeWidth={2} />
                  <Text style={styles.ribbonText}>{t('rewardCongrats')}</Text>
                </View>
                <Text style={styles.rewardTitle}>
                  {t(`rt${item.rewardType}` as TranslationKey)} × {item.quantity}
                </Text>
                {!!item.campaign?.name && <Text style={styles.campaign}>{item.campaign.name}</Text>}
                {!!item.campaign?.sponsor && (
                  <Text style={styles.sponsor}>{t('rewardFrom', { sponsor: item.campaign.sponsor })}</Text>
                )}
                <View style={styles.statusRow}>
                  <View style={[styles.statusChip, done && styles.statusChipDone]}>
                    <Text style={[styles.statusText, done && styles.statusTextDone]}>
                      {t(`rewardStatus${item.status}` as TranslationKey)}
                    </Text>
                  </View>
                </View>
                {!done && (
                  <TouchableOpacity
                    style={[styles.confirmBtn, busyId === item.id && { opacity: 0.6 }]}
                    onPress={() => confirm(item)}
                    disabled={busyId === item.id}
                  >
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="#fff" strokeWidth={2} />
                    <Text style={styles.confirmText}>{t('confirmReceipt')}</Text>
                  </TouchableOpacity>
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
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
  ribbon: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: '#10B981', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, marginBottom: 12 },
  ribbonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  rewardTitle: { fontSize: 18, fontWeight: '900', color: '#065F46' },
  campaign: { fontSize: 14, color: '#374151', marginTop: 4, fontWeight: '600' },
  sponsor: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  statusRow: { flexDirection: 'row', marginTop: 12 },
  statusChip: { backgroundColor: 'rgba(245,158,11,0.15)', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 10 },
  statusChipDone: { backgroundColor: 'rgba(16,185,129,0.15)' },
  statusText: { fontSize: 12, fontWeight: '800', color: '#B45309' },
  statusTextDone: { color: '#10B981' },
  confirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#065F46', paddingVertical: 13, borderRadius: 12, marginTop: 14 },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
