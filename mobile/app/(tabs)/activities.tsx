import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Add01Icon } from '@hugeicons/core-free-icons';
import { activitiesApi } from '../../src/lib/data';
import { useAuthStore } from '../../src/store/auth.store';
import { timeAgo, useI18n } from '../../src/i18n';

export default function Activities() {
  const { farmerId } = useAuthStore();
  const { t } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        if (!farmerId) { setLoading(false); return; }
        try {
          const res = await activitiesApi.listForFarmer(farmerId);
          if (active) setItems(res.data || []);
        } finally {
          if (active) setLoading(false);
        }
      })();
      return () => { active = false; };
    }, [farmerId]),
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.empty}>{t('recentActivitiesEmpty')}</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/activity-select-cycle')} activeOpacity={0.85}>
                <Text style={styles.emptyBtnText}>{t('logActivity')}</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.icon}><Text style={{ fontSize: 18 }}>{item.icon || '•'}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                {!!item.subtitle && <Text style={styles.subtitle} numberOfLines={1}>{item.subtitle}</Text>}
              </View>
              <Text style={styles.time}>{timeAgo(item.createdAt, t)}</Text>
            </View>
          )}
        />
      )}

      {!loading && items.length > 0 && (
        <TouchableOpacity style={styles.fab} onPress={() => router.push('/activity-select-cycle')} activeOpacity={0.85}>
          <HugeiconsIcon icon={Add01Icon} size={26} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#6B7280', textAlign: 'center', marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  emptyContainer: { alignItems: 'center', paddingTop: 20 },
  emptyBtn: {
    backgroundColor: '#10B981', paddingVertical: 14, paddingHorizontal: 28,
    borderRadius: 14, marginTop: 20, shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  emptyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#10B981', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB',
  },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  title: { fontSize: 14, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  time: { fontSize: 11, color: '#9CA3AF', marginLeft: 8 },
});
