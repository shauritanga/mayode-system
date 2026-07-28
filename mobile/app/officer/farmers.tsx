import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Search01Icon, ArrowRight01Icon, UserGroupIcon } from '@hugeicons/core-free-icons';
import { farmersApi, workspaceApi } from '../../src/lib/data';
import { useI18n } from '../../src/i18n';

interface FarmerRow {
  id: string;
  firstName: string;
  lastName: string;
  controlNumber: string;
  verificationStatus: string;
  village?: string | null;
  ward?: string | null;
}

export default function OfficerFarmersScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const [mamcosId, setMamcosId] = useState<string | null | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<FarmerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (searchTerm: string) => {
    setLoading(true);
    try {
      const ctx = await workspaceApi.context();
      const scopeId = ctx.data?.mamcos?.id ?? null;
      setMamcosId(scopeId);
      if (!scopeId) {
        setItems([]);
        return;
      }
      const res = await farmersApi.getAll({ mamcosId: scopeId, search: searchTerm || undefined, pageSize: 50 });
      setItems(res.data?.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(search); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('myFarmers') }} />
      <View style={styles.searchBar}>
        <HugeiconsIcon icon={Search01Icon} size={18} color="#6B7280" strokeWidth={2} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('searchFarmers')}
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          onSubmitEditing={() => load(search)}
          returnKeyType="search"
        />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : mamcosId === null ? (
        <View style={styles.center}>
          <HugeiconsIcon icon={UserGroupIcon} size={40} color="#D1D5DB" strokeWidth={1.5} />
          <Text style={styles.emptyText}>{t('farmerNotInAmcos')}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <HugeiconsIcon icon={UserGroupIcon} size={40} color="#D1D5DB" strokeWidth={1.5} />
          <Text style={styles.emptyText}>{t('noFarmersFound')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(f) => f.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => router.push(`/officer/farmer/${item.id}`)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.sub}>{item.controlNumber}{item.village ? ` · ${item.village}` : ''}</Text>
              </View>
              <View style={[styles.badge, item.verificationStatus === 'VERIFIED' ? styles.badgeGreen : styles.badgeGold]}>
                <Text style={[styles.badgeText, item.verificationStatus === 'VERIFIED' ? styles.badgeTextGreen : styles.badgeTextGold]}>
                  {item.verificationStatus}
                </Text>
              </View>
              <HugeiconsIcon icon={ArrowRight01Icon} size={18} color="#9CA3AF" strokeWidth={2} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff',
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB',
  },
  name: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  badgeGreen: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  badgeGold: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  badgeText: { fontSize: 10, fontWeight: '700' },
  badgeTextGreen: { color: '#10B981' },
  badgeTextGold: { color: '#F59E0B' },
});
