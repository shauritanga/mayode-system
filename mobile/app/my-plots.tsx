import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { plotTransfersApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

const apiMessage = (e: any) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e);
};

type Plot = { allocationId: string; hectare: { id: string; code: string; area: number; block: string; canal: string }; guardian?: { name: string } | null; holder?: { name: string }; transfer?: { id: string } | null; emancipationRequested: boolean };
type Outgoing = { id: string; hectare: { id: string; code: string }; to: { name: string; memberNumber: string } };

/** My hectares: start a transfer to another member, or ask for a dependent's hectare to be released when they come of age. */
export default function MyPlots() {
  const { t } = useI18n();
  const [held, setHeld] = useState<Plot[]>([]);
  const [guided, setGuided] = useState<Plot[]>([]);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formFor, setFormFor] = useState<string | null>(null);
  const [toMember, setToMember] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setLoading(true);
    try {
      const res = await plotTransfersApi.myPlots();
      setHeld(res.data?.held ?? []); setGuided(res.data?.guided ?? []); setOutgoing(res.data?.outgoing ?? []);
    } catch (e: any) { Alert.alert(t('myPlots'), apiMessage(e)); } finally { setLoading(false); setRefreshing(false); }
  }, [t]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const send = async (p: Plot) => {
    if (!toMember.trim() || !reason.trim()) { Alert.alert(t('myPlots'), t('myPlotsTransferNeed')); return; }
    setBusy(true);
    try {
      await plotTransfersApi.request({ hectareId: p.hectare.id, toMember: toMember.trim(), reason: reason.trim() });
      setFormFor(null); setToMember(''); setReason('');
      Alert.alert(t('myPlots'), t('myPlotsTransferSent'));
    } catch (e: any) { Alert.alert(t('myPlots'), apiMessage(e)); } finally { setBusy(false); await load(); }
  };
  const withdraw = async (id: string) => {
    setBusy(true);
    try { await plotTransfersApi.withdraw(id); Alert.alert(t('myPlots'), t('myPlotsTransferWithdrawn')); }
    catch (e: any) { Alert.alert(t('myPlots'), apiMessage(e)); } finally { setBusy(false); await load(); }
  };
  const emancipate = (p: Plot) => {
    const name = p.holder?.name ?? '';
    Alert.alert(t('myPlots'), t('myPlotsEmancipateAsk', { code: p.hectare.code, name }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('myPlotsEmancipate'), onPress: async () => {
        setBusy(true);
        try { await plotTransfersApi.requestEmancipation(p.allocationId); Alert.alert(t('myPlots'), t('myPlotsEmancipateSent')); }
        catch (e: any) { Alert.alert(t('myPlots'), apiMessage(e)); } finally { setBusy(false); await load(); }
      } },
    ]);
  };

  const place = (p: Plot) => `${p.hectare.canal} · ${p.hectare.block} · ${p.hectare.area} ha`;
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('myPlots') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
        <Text style={styles.intro}>{t('myPlotsIntro')}</Text>
        {loading ? <ActivityIndicator color="#10B981" style={{ marginTop: 30 }} /> : (
          <>
            <Text style={styles.section}>{t('myPlotsHeld')}</Text>
            {held.length === 0 ? <Text style={styles.empty}>{t('myPlotsNone')}</Text> : held.map((p) => {
              const waiting = outgoing.find((o) => o.id === p.transfer?.id);
              return (
                <View key={p.allocationId} style={styles.card}>
                  <Text style={styles.code}>{p.hectare.code}</Text>
                  <Text style={styles.line}>{place(p)}</Text>
                  {p.guardian ? <Text style={styles.line}>{t('myPlotsGuardian', { name: p.guardian.name })}</Text> : null}
                  {waiting ? (
                    <>
                      <Text style={styles.waiting}>{t('myPlotsTransferWaiting', { name: waiting.to.name })}</Text>
                      <TouchableOpacity style={[styles.btn, styles.btnGhost]} disabled={busy} onPress={() => withdraw(waiting.id)}><Text style={styles.btnGhostText}>{t('myPlotsTransferWithdraw')}</Text></TouchableOpacity>
                    </>
                  ) : formFor === p.allocationId ? (
                    <>
                      <Text style={styles.label}>{t('myPlotsTransferTo')}</Text>
                      <TextInput style={styles.input} value={toMember} onChangeText={setToMember} autoCapitalize="characters" placeholderTextColor="#9CA3AF" />
                      <Text style={styles.label}>{t('myPlotsTransferReason')}</Text>
                      <TextInput style={[styles.input, { minHeight: 70 }]} value={reason} onChangeText={setReason} multiline placeholderTextColor="#9CA3AF" />
                      <View style={styles.row}>
                        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setFormFor(null)} disabled={busy}><Text style={styles.btnGhostText}>{t('cancel')}</Text></TouchableOpacity>
                        <TouchableOpacity style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]} onPress={() => send(p)} disabled={busy}><Text style={styles.btnText}>{busy ? '…' : t('myPlotsTransferSend')}</Text></TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => { setFormFor(p.allocationId); setToMember(''); setReason(''); }}><Text style={styles.btnText}>{t('myPlotsTransfer')}</Text></TouchableOpacity>
                  )}
                </View>
              );
            })}

            <Text style={styles.section}>{t('myPlotsGuided')}</Text>
            {guided.length === 0 ? <Text style={styles.empty}>{t('myPlotsNoneGuided')}</Text> : guided.map((p) => (
              <View key={p.allocationId} style={styles.card}>
                <Text style={styles.code}>{p.hectare.code}</Text>
                <Text style={styles.line}>{place(p)}</Text>
                <Text style={styles.line}>{t('myPlotsHolder', { name: p.holder?.name ?? '' })}</Text>
                {p.emancipationRequested
                  ? <Text style={styles.waiting}>{t('myPlotsEmancipateWaiting')}</Text>
                  : <TouchableOpacity style={[styles.btn, styles.btnPrimary, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => emancipate(p)}><Text style={styles.btnText}>{t('myPlotsEmancipate')}</Text></TouchableOpacity>}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  intro: { fontSize: 13, color: '#6B7280', marginBottom: 14 },
  section: { fontSize: 14, fontWeight: '800', color: '#111827', marginTop: 10, marginBottom: 8 },
  empty: { color: '#6B7280', fontSize: 13, marginBottom: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  code: { fontSize: 18, fontWeight: '900', color: '#10B981', marginBottom: 4 },
  line: { fontSize: 13, color: '#374151', marginTop: 3 },
  waiting: { fontSize: 13, color: '#B45309', fontWeight: '700', marginTop: 10 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  btnPrimary: { backgroundColor: '#065F46' },
  btnGhost: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnGhostText: { color: '#374151', fontWeight: '700', fontSize: 14 },
});
