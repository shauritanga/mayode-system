import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { meetingsApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

const apiMessage = (e: any) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e);
};

type Meeting = { id: string; kind: 'BOARD' | 'AGM'; title: string; agenda: string; venue: string; scheduledAt: string; checkInOpen: boolean; checkedIn: boolean };

/** Meetings the member is invited to (board meetings for board members, the General Meeting for everyone), with check-in. */
export default function Meetings() {
  const { t } = useI18n();
  const [items, setItems] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setLoading(true);
    try { setItems((await meetingsApi.mine()).data?.data ?? []); }
    catch (e: any) { Alert.alert(t('meetings'), apiMessage(e)); } finally { setLoading(false); setRefreshing(false); }
  }, [t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const checkIn = async (m: Meeting) => {
    setBusyId(m.id);
    try { await meetingsApi.checkIn(m.id); Alert.alert(t('meetings'), t('meetingsCheckInDone')); }
    catch (e: any) { Alert.alert(t('meetings'), apiMessage(e)); } finally { setBusyId(null); await load(); }
  };
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('meetings') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
        <Text style={styles.intro}>{t('meetingsIntro')}</Text>
        {loading ? <ActivityIndicator color="#10B981" style={{ marginTop: 30 }} /> : items.length === 0 ? (
          <Text style={styles.empty}>{t('meetingsNone')}</Text>
        ) : items.map((m) => (
          <View key={m.id} style={styles.card}>
            <Text style={styles.kind}>{m.kind === 'AGM' ? t('meetingsAgm') : t('meetingsBoard')}</Text>
            <Text style={styles.title}>{m.title}</Text>
            <Text style={styles.line}>{when(m.scheduledAt)}</Text>
            <Text style={styles.line}>{t('meetingsVenue', { venue: m.venue })}</Text>
            <Text style={styles.label}>{t('meetingsAgenda')}</Text>
            <Text style={styles.line}>{m.agenda}</Text>
            {m.checkedIn ? <Text style={styles.done}>{t('meetingsCheckedIn')}</Text>
              : m.checkInOpen ? (
                <TouchableOpacity style={[styles.btn, busyId === m.id && { opacity: 0.6 }]} disabled={busyId === m.id} onPress={() => checkIn(m)}>
                  <Text style={styles.btnText}>{busyId === m.id ? '…' : t('meetingsCheckIn')}</Text>
                </TouchableOpacity>
              ) : <Text style={styles.wait}>{t('meetingsCheckInWait')}</Text>}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  intro: { fontSize: 13, color: '#6B7280', marginBottom: 14 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  kind: { fontSize: 11, fontWeight: '800', color: '#10B981', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 18, fontWeight: '900', color: '#111827', marginVertical: 4 },
  line: { fontSize: 13, color: '#374151', marginTop: 3 },
  label: { fontSize: 12, fontWeight: '800', color: '#6B7280', marginTop: 12 },
  btn: { backgroundColor: '#065F46', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  done: { color: '#047857', fontWeight: '800', marginTop: 16, fontSize: 14 },
  wait: { color: '#6B7280', marginTop: 16, fontSize: 13 },
});
