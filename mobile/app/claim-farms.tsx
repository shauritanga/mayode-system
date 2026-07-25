import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { CheckmarkCircle02Icon, Plant01Icon } from '@hugeicons/core-free-icons';
import { registryApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

interface RegistryRecord {
  id: string;
  name?: string;
  ownerName: string;
  plotNumber?: string;
  block?: string;
  farmSizeHectares?: number;
  status: string;
  mamcos?: { name: string };
}

export default function ClaimFarmsScreen() {
  const { t } = useI18n();
  const [items, setItems] = useState<RegistryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await registryApi.mine();
      setItems(res.data ?? []);
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (rec: RegistryRecord, claim: boolean) => {
    setBusyId(rec.id);
    try {
      if (claim) await registryApi.claim(rec.id);
      else await registryApi.reject(rec.id);
      Alert.alert(t('confirmYourFarms'), claim ? t('farmClaimed') : t('farmRejected'));
      await load();
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('confirmYourFarms'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('confirmYourFarms') }} />
      {loading && items.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
          ListHeaderComponent={items.length > 0 ? <Text style={styles.intro}>{t('registryIntro')}</Text> : null}
          ListEmptyComponent={
            <View style={styles.empty}>
              <HugeiconsIcon icon={Plant01Icon} size={44} color="#D1FAE5" strokeWidth={1.5} />
              <Text style={styles.emptyText}>{t('noPreRegistered')}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.name}>{item.name || '—'}</Text>
              <View style={styles.metaRow}>
                {!!item.plotNumber && <Text style={styles.meta}>Plot {item.plotNumber}</Text>}
                {!!item.block && <Text style={styles.meta}>· Block {item.block}</Text>}
                {item.farmSizeHectares != null && <Text style={styles.meta}>· {item.farmSizeHectares} ha</Text>}
              </View>
              {!!item.mamcos?.name && (
                <Text style={styles.amcos}>{t('registeredByAmcos', { amcos: item.mamcos.name })}</Text>
              )}
              <Text style={styles.question}>{t('claimQuestion')}</Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.claimBtn, busyId === item.id && { opacity: 0.6 }]}
                  onPress={() => act(item, true)}
                  disabled={busyId === item.id}
                >
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="#fff" strokeWidth={2} />
                  <Text style={styles.claimText}>{t('claimFarm')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.rejectBtn, busyId === item.id && { opacity: 0.6 }]}
                  onPress={() => act(item, false)}
                  disabled={busyId === item.id}
                >
                  <Text style={styles.rejectText}>{t('rejectFarm')}</Text>
                </TouchableOpacity>
              </View>
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
  intro: { fontSize: 13, color: '#6B7280', marginBottom: 14, lineHeight: 19 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 12, lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  name: { fontSize: 16, fontWeight: '800', color: '#111827' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  meta: { fontSize: 12, color: '#6B7280' },
  amcos: { fontSize: 12, fontWeight: '700', color: '#10B981', marginTop: 6 },
  question: { fontSize: 13, color: '#065F46', marginTop: 12, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  claimBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', paddingVertical: 12, borderRadius: 12 },
  claimText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  rejectBtn: { flex: 1, borderWidth: 1.5, borderColor: '#EF4444', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  rejectText: { color: '#EF4444', fontWeight: '800', fontSize: 14 },
});
