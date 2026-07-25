import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { activitiesApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { timeAgo, useI18n } from '../src/i18n';

export default function Activities() {
  const { farmerId } = useAuthStore();
  const { t } = useI18n();
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
      <Stack.Screen options={{ headerShown: true, title: t('recentActivities') }} />
      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>{t('recentActivitiesEmpty')}</Text>}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#6B7280', textAlign: 'center', marginTop: 40, paddingHorizontal: 24, lineHeight: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB',
  },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  title: { fontSize: 14, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  time: { fontSize: 11, color: '#9CA3AF', marginLeft: 8 },
});
