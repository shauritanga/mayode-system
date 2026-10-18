import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { fieldWorkApi } from '../../src/lib/api';
import { useI18n } from '../../src/i18n';

const COLOR: Record<string, string> = { ASSIGNED: '#3B82F6', ACKNOWLEDGED: '#3B82F6', IN_PROGRESS: '#F59E0B', PENDING_REVIEW: '#8B5CF6', RETURNED: '#EF4444', REJECTED: '#EF4444', COMPLETED: '#10B981', CANCELLED: '#9CA3AF' };
const nice = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export default function FieldWorkList() {
  const { t } = useI18n();
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setTasks((await fieldWorkApi.tasks()).data ?? []); } catch { /* offline with nothing cached */ } finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('fieldWork') }} />
      {loading && tasks.length === 0 ? <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View> : (
        <FlatList
          data={tasks}
          keyExtractor={(x) => x.id}
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={<Text style={styles.muted}>{t('noFieldTasks')}</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity style={[styles.card, { borderLeftColor: COLOR[item.status] ?? '#9CA3AF' }]} onPress={() => router.push(`/field-work/${item.id}` as any)}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.line}>{item.farm?.name}{item.plot ? ` · ${item.plot.name ?? item.plot.plotCode}` : ''}</Text>
              <Text style={styles.line}>{nice(item.status)}{item.deadline ? ` · ${t('fwDeadline')} ${new Date(item.deadline).toLocaleDateString()}` : ''}{item.overdue ? ` · ${t('fwOverdue')}` : ''}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB', borderLeftWidth: 4 },
  title: { fontSize: 15, fontWeight: '700', color: '#111827' },
  line: { fontSize: 13, color: '#374151', marginTop: 4 },
  muted: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 40 },
});
