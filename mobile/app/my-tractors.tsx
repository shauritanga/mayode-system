import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { marketplaceApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

export default function MyTractors() {
  const { ownerId } = useLocalSearchParams<{ ownerId: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [tractors, setTractors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await marketplaceApi.getMyTractors(ownerId);
      setTractors(res.data ?? []);
    } catch {
      /* keep previous list */
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmBooking = async (bookingId: string) => {
    setBusyId(bookingId);
    try {
      await marketplaceApi.confirmTractorBooking(bookingId);
      await load();
    } catch (e: any) {
      Alert.alert(t('mlaxConfirmBooking'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  const completeBooking = async (bookingId: string) => {
    setBusyId(bookingId);
    try {
      await marketplaceApi.completeTractorBooking(bookingId);
      await load();
    } catch (e: any) {
      Alert.alert(t('mlaxCompleteBooking'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('mlaxMyTractors') }} />
      {loading && tractors.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View>
      ) : (
        <FlatList
          data={tractors}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
          ListEmptyComponent={<Text style={styles.emptyText}>{t('mlaxNoMyTractors')}</Text>}
          ListFooterComponent={
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/tractor-register' as any)}>
              <Text style={styles.addBtnText}>{t('mlaxRegisterTractor')}</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.tractorModel}>{item.model || t('tractors')}</Text>
                <Text style={styles.regNo}>{item.registrationNo}</Text>
              </View>
              {(item.bookings ?? []).map((b: any) => (
                <View key={b.id} style={styles.bookingRow}>
                  <Text style={styles.bookingText}>{b.hectares} ha · {b.status}</Text>
                  {b.status === 'PENDING' && (
                    <TouchableOpacity
                      style={[styles.smallBtn, busyId === b.id && { opacity: 0.6 }]}
                      onPress={() => confirmBooking(b.id)}
                      disabled={busyId === b.id}
                    >
                      <Text style={styles.smallBtnText}>{t('mlaxConfirmBooking')}</Text>
                    </TouchableOpacity>
                  )}
                  {b.status === 'CONFIRMED' && (
                    <TouchableOpacity
                      style={[styles.smallBtn, busyId === b.id && { opacity: 0.6 }]}
                      onPress={() => completeBooking(b.id)}
                      disabled={busyId === b.id}
                    >
                      <Text style={styles.smallBtnText}>{t('mlaxCompleteBooking')}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
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
  emptyText: { color: '#6B7280', textAlign: 'center', paddingVertical: 40, fontSize: 15 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  tractorModel: { fontSize: 16, fontWeight: '800', color: '#111827' },
  regNo: { fontSize: 13, color: '#10B981', fontWeight: '700' },
  bookingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  bookingText: { fontSize: 13, color: '#374151' },
  smallBtn: { backgroundColor: '#10B981', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
  smallBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  addBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
