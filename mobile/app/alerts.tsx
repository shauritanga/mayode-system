import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Alert02Icon, SquareLock02Icon } from '@hugeicons/core-free-icons';
import { alertsApi } from '../src/lib/data';
import { useI18n, TranslationKey } from '../src/i18n';

export interface FarmAlert {
  id: string;
  farmId: string;
  farmCode?: string;
  farmName?: string;
  category: string;
  urgency: string;
  title: string;
  previewMessage: string;
  status: string;
  locked: boolean;
  createdAt: string;
}

const URGENCY_COLOR: Record<string, string> = {
  LOW: '#6B7280', MEDIUM: '#3B82F6', HIGH: '#F59E0B', CRITICAL: '#EF4444',
};

export function urgencyColor(u: string) { return URGENCY_COLOR[u] ?? '#6B7280'; }

export default function AlertsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<FarmAlert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await alertsApi.list();
      setItems(res.data ?? []);
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('farmAlerts') }} />
      {loading && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <HugeiconsIcon icon={Alert02Icon} size={44} color="#D1FAE5" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t('noAlerts')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <AlertRow item={item} onPress={() => router.push({ pathname: '/alert/[id]', params: { id: item.id } })} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

export function AlertRow({ item, onPress }: { item: FarmAlert; onPress: () => void }) {
  const { t } = useI18n();
  const done = item.status === 'COMPLETED';
  return (
    <TouchableOpacity style={[styles.card, done && styles.cardDone]} onPress={onPress}>
      <View style={styles.cardHeader}>
        <View style={[styles.urgencyDot, { backgroundColor: urgencyColor(item.urgency) }]} />
        <Text style={styles.category}>{t(`cat${item.category}` as TranslationKey)}</Text>
        <View style={[styles.urgencyChip, { backgroundColor: urgencyColor(item.urgency) + '22' }]}>
          <Text style={[styles.urgencyText, { color: urgencyColor(item.urgency) }]}>
            {t(`urgency${item.urgency}` as TranslationKey)}
          </Text>
        </View>
        {item.locked && <HugeiconsIcon icon={SquareLock02Icon} size={15} color="#B45309" strokeWidth={2} />}
      </View>
      <Text style={[styles.title, done && styles.titleDone]}>{item.title}</Text>
      <Text style={styles.preview} numberOfLines={2}>{item.previewMessage}</Text>
      {!!item.farmCode && <Text style={styles.farm}>{item.farmCode}{item.farmName ? ` · ${item.farmName}` : ''}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  cardDone: { opacity: 0.6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  urgencyDot: { width: 8, height: 8, borderRadius: 4 },
  category: { fontSize: 12, fontWeight: '700', color: '#6B7280', flex: 1, textTransform: 'uppercase' },
  urgencyChip: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  urgencyText: { fontSize: 10, fontWeight: '800' },
  title: { fontSize: 15, fontWeight: '800', color: '#111827', marginTop: 8 },
  titleDone: { textDecorationLine: 'line-through' },
  preview: { fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 19 },
  farm: { fontSize: 12, fontWeight: '700', color: '#10B981', marginTop: 8 },
});
