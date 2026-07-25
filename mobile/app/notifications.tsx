import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Notification03Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { notificationsApi } from '../src/lib/data';
import { useI18n, timeAgo } from '../src/i18n';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: { leaseId?: string; farmId?: string; membershipId?: string; alertId?: string; winnerId?: string; campaignId?: string; registryId?: string } | null;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationCenter() {
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list();
      setItems(res.data ?? []);
    } catch {
      // Keep the previous list on transient network errors.
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openItem = async (item: Notification) => {
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      try { await notificationsApi.markRead(item.id); } catch { /* non-fatal */ }
    }
    // Deep-link by notification payload.
    if (item.data?.alertId) router.push({ pathname: '/alert/[id]', params: { id: item.data.alertId } });
    else if (item.data?.registryId) router.push('/claim-farms');
    else if (item.data?.winnerId || item.data?.campaignId) router.push('/rewards');
    else if (item.data?.leaseId) router.push('/leases');
    else if (item.data?.membershipId) router.push('/membership');
    else if (item.data?.farmId) router.push({ pathname: '/farm/[id]', params: { id: item.data.farmId } });
  };

  const markAll = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try { await notificationsApi.markAllRead(); } catch { /* non-fatal */ }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('notificationCenter') }} />
      {loading && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
          ListHeaderComponent={
            items.some((n) => !n.isRead) ? (
              <TouchableOpacity style={styles.markAllBtn} onPress={markAll}>
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="#10B981" strokeWidth={2} />
                <Text style={styles.markAllText}>{t('markAllRead')}</Text>
              </TouchableOpacity>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <HugeiconsIcon icon={Notification03Icon} size={44} color="#D1FAE5" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t('emptyNotifications')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, !item.isRead && styles.cardUnread]}
              onPress={() => openItem(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.title, !item.isRead && styles.titleUnread]} numberOfLines={1}>
                  {item.title}
                </Text>
                {!item.isRead && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.time}>{timeAgo(item.createdAt, t)}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: 'rgba(16,185,129,0.12)', paddingVertical: 10, borderRadius: 12, marginBottom: 12,
  },
  markAllText: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  cardUnread: { borderColor: '#A7F3D0', backgroundColor: '#F0FDF9' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14, fontWeight: '700', color: '#374151', flex: 1 },
  titleUnread: { color: '#111827', fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981', marginLeft: 8 },
  body: { fontSize: 13, color: '#6B7280', marginTop: 4, lineHeight: 19 },
  time: { fontSize: 11, color: '#9CA3AF', marginTop: 8 },
});
