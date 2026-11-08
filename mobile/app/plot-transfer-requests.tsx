import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { plotTransfersApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

type Incoming = {
  id: string;
  hectare: { id: string; code: string };
  from: { id: string; name: string; memberNumber: string };
  reason: string;
  effectiveDate: string;
};

const apiMessage = (e: any) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e);
};

/** The receiving member's accept / decline screen for plot (hectare) transfers. */
export default function PlotTransferRequests() {
  const { t } = useI18n();
  const [items, setItems] = useState<Incoming[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setLoading(true);
    try {
      const res = await plotTransfersApi.incoming();
      setItems(res.data ?? []);
    } catch (e: any) {
      Alert.alert(t('plotTransferRequests'), apiMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const accept = (item: Incoming) => {
    Alert.alert(
      t('plotTransferRequests'),
      t('plotTransferConfirmAccept', { code: item.hectare.code, name: item.from.name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('plotTransferAccept'),
          onPress: async () => {
            setBusyId(item.id);
            try {
              await plotTransfersApi.accept(item.id);
              Alert.alert(t('plotTransferRequests'), t('plotTransferAccepted'));
            } catch (e: any) {
              Alert.alert(t('plotTransferRequests'), apiMessage(e));
            } finally {
              setBusyId(null);
              await load();
            }
          },
        },
      ],
    );
  };

  const decline = async (item: Incoming) => {
    if (!reason.trim()) {
      Alert.alert(t('plotTransferRequests'), t('plotTransferReasonRequired'));
      return;
    }
    setBusyId(item.id);
    try {
      await plotTransfersApi.decline(item.id, reason.trim());
      setDecliningId(null);
      setReason('');
      Alert.alert(t('plotTransferRequests'), t('plotTransferDeclined'));
    } catch (e: any) {
      Alert.alert(t('plotTransferRequests'), apiMessage(e));
    } finally {
      setBusyId(null);
      await load();
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('plotTransferRequests') }} />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <Text style={styles.intro}>{t('plotTransferIntro')}</Text>
        {loading ? (
          <ActivityIndicator color="#10B981" style={{ marginTop: 30 }} />
        ) : items.length === 0 ? (
          <Text style={styles.empty}>{t('plotTransferNone')}</Text>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.code}>{t('plotTransferHectare', { code: item.hectare.code })}</Text>
              <Text style={styles.line}>{t('plotTransferFrom', { name: item.from.name, number: item.from.memberNumber })}</Text>
              <Text style={styles.line}>{t('plotTransferEffective', { date: item.effectiveDate.slice(0, 10) })}</Text>
              <Text style={styles.line}>{t('plotTransferReason', { reason: item.reason })}</Text>

              {decliningId === item.id ? (
                <>
                  <Text style={styles.label}>{t('plotTransferDeclineReason')}</Text>
                  <TextInput
                    style={styles.input}
                    value={reason}
                    onChangeText={setReason}
                    multiline
                    placeholderTextColor="#9CA3AF"
                  />
                  <View style={styles.row}>
                    <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => { setDecliningId(null); setReason(''); }} disabled={busyId === item.id}>
                      <Text style={styles.btnGhostText}>{t('cancel')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.btn, styles.btnDanger, busyId === item.id && { opacity: 0.6 }]} onPress={() => decline(item)} disabled={busyId === item.id}>
                      <Text style={styles.btnText}>{busyId === item.id ? '…' : t('plotTransferConfirmDecline')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => { setDecliningId(item.id); setReason(''); }} disabled={busyId === item.id}>
                    <Text style={styles.btnGhostText}>{t('plotTransferDecline')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btn, styles.btnPrimary, busyId === item.id && { opacity: 0.6 }]} onPress={() => accept(item)} disabled={busyId === item.id}>
                    <Text style={styles.btnText}>{busyId === item.id ? '…' : t('plotTransferAccept')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  intro: { fontSize: 13, color: '#6B7280', marginBottom: 14 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  code: { fontSize: 18, fontWeight: '900', color: '#10B981', marginBottom: 6 },
  line: { fontSize: 13, color: '#374151', marginTop: 3 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#065F46' },
  btnDanger: { backgroundColor: '#DC2626' },
  btnGhost: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnGhostText: { color: '#374151', fontWeight: '700', fontSize: 14 },
});
