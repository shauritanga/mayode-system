import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Add01Icon, TaskDaily01Icon } from '@hugeicons/core-free-icons';
import { activitiesApi } from '../../../src/lib/data';
import { useAuthStore } from '../../../src/store/auth.store';
import { useI18n } from '../../../src/i18n';
import ActivityFeedCard from '../../../src/components/ActivityFeedCard';

export default function Activities() {
  const { farmerId } = useAuthStore();
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!farmerId) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      const res = await activitiesApi.listForFarmer(farmerId);
      setItems(res.data || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [farmerId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor="#10B981" />
          }
        >
          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <HugeiconsIcon icon={TaskDaily01Icon} size={28} color="#059669" strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>{t('recentActivitiesEmpty')}</Text>
              <Text style={styles.emptyHint}>{t('activitiesFieldOnlyHint')}</Text>
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push({ pathname: '/activity-select-cycle', params: { purpose: 'activity' } })}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyBtnText}>{t('logActivity')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emptyBtnSecondary}
                onPress={() => router.push({ pathname: '/activity-select-cycle', params: { purpose: 'expense' } })}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyBtnSecondaryText}>{t('addExpense')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emptyBtnSecondary}
                onPress={() => router.push({ pathname: '/activity-select-cycle', params: { purpose: 'sale' } })}
                activeOpacity={0.85}
              >
                <Text style={styles.emptyBtnSecondaryText}>{t('recordSale')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.listHint}>{t('recentActivities')}</Text>
              <ActivityFeedCard items={items} />
            </>
          )}
        </ScrollView>
      )}

      {!loading && items.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push({ pathname: '/activity-select-cycle', params: { purpose: 'activity' } })}
          activeOpacity={0.85}
        >
          <HugeiconsIcon icon={Add01Icon} size={26} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 110 },
  listHint: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  emptyContainer: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 28 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    fontSize: 14,
  },
  emptyHint: {
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 19,
    fontSize: 13,
    marginTop: 10,
  },
  emptyBtn: {
    backgroundColor: '#065F46',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginTop: 22,
    minWidth: 220,
    alignItems: 'center',
  },
  emptyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  emptyBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#065F46',
    paddingVertical: 13,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginTop: 10,
    minWidth: 220,
    alignItems: 'center',
  },
  emptyBtnSecondaryText: { color: '#065F46', fontSize: 15, fontWeight: '700' },
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
