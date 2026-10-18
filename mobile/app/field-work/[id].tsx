import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { fieldWorkApi } from '../../src/lib/api';
import { getApiErrorMessage } from '../../src/lib/api-error';
import { useI18n } from '../../src/i18n';

type Mode = null | 'nogps' | 'report' | 'inspection';
const nice = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');
const newKey = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function FieldWorkTask() {
  const { t } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [task, setTask] = useState<any>(null);
  const [inputs, setInputs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState('');
  const [rep, setRep] = useState({ qty: '', unit: '', observations: '', incomplete: '' });
  const [used, setUsed] = useState<{ itemId: string; quantity: string }[]>([]);
  const [insp, setInsp] = useState({ condition: '', stage: '', pests: '', diseases: '', observations: '', next: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([fieldWorkApi.task(id), fieldWorkApi.inputs().catch(() => ({ data: [] }))]);
      setTask(a.data); setInputs(b.data ?? []);
    } catch { /* keep what we have */ } finally { setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  /** Runs a write; a request saved for later still counts as done for the person in the field. */
  const send = async (fn: () => Promise<{ data: any }>, okText: string) => {
    setBusy(true);
    try {
      const r = await fn();
      setMode(null);
      Alert.alert('', r.data?.queued ? t('fwSavedOffline') : okText);
      if (!r.data?.queued) await load();
    } catch (e) { Alert.alert('', getApiErrorMessage(e)); } finally { setBusy(false); }
  };

  const mark = async (kind: 'CHECK_IN' | 'CHECK_OUT') => {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { Alert.alert('', t('fwLocationDenied')); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const r = await fieldWorkApi.checkIn(id, { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy ?? undefined, deviceTime: new Date(pos.timestamp).toISOString(), kind, clientKey: newKey() });
      if (r.data?.queued) Alert.alert('', t('fwSavedOffline'));
      else Alert.alert('', r.data?.withinGeofence === false ? t('fwOutsidePlot') : t('fwLocationRecorded'));
      if (!r.data?.queued) await load();
    } catch (e) { Alert.alert('', getApiErrorMessage(e)); } finally { setBusy(false); }
  };

  if (loading && !task) return <SafeAreaView style={styles.container}><Stack.Screen options={{ headerShown: true, title: t('fieldWork') }} /><View style={styles.center}><ActivityIndicator color="#10B981" size="large" /></View></SafeAreaView>;
  if (!task) return <SafeAreaView style={styles.container}><Stack.Screen options={{ headerShown: true, title: t('fieldWork') }} /></SafeAreaView>;

  const open = ['ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RETURNED'].includes(task.status);
  const checkIns: any[] = task.checkIns ?? [];
  const checkedIn = checkIns.some((c) => c.kind === 'CHECK_IN');
  const checkedOut = checkIns.some((c) => c.kind === 'CHECK_OUT');
  const isInspection = task.type === 'INSPECTION';
  const input = (value: string, set: (v: string) => void, label: string, props: object = {}) => (
    <View style={{ marginTop: 8 }}><Text style={styles.label}>{label}</Text><TextInput style={styles.input} value={value} onChangeText={set} {...props} /></View>
  );
  const btn = (text: string, onPress: () => void, primary = false, disabled = false) => (
    <TouchableOpacity key={text} style={[styles.btn, primary ? styles.btnPrimary : styles.btnPlain, disabled && { opacity: 0.5 }]} disabled={disabled || busy} onPress={onPress}>
      <Text style={[styles.btnText, primary && { color: '#fff' }]}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: task.reference }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{task.title}</Text>
        <Text style={styles.line}>{nice(task.status)} · {nice(task.activityType)}</Text>
        <Text style={styles.line}>{task.farm?.name}{task.plot ? ` · ${task.plot.name ?? task.plot.plotCode}` : ''}</Text>
        {task.deadline && <Text style={styles.line}>{t('fwDeadline')}: {new Date(task.deadline).toLocaleDateString()}</Text>}
        {task.instructions && <View style={styles.card}><Text style={styles.label}>{t('fwInstructions')}</Text><Text style={styles.line}>{task.instructions}</Text></View>}
        {task.inspectionObjective && <View style={styles.card}><Text style={styles.line}>{task.inspectionObjective}</Text></View>}
        {task.reviewComment && <View style={[styles.card, { borderColor: '#FCA5A5' }]}><Text style={styles.label}>{t('fwReviewerSaid')}</Text><Text style={styles.line}>{task.reviewComment}</Text></View>}

        {open && mode === null && (
          <View style={{ marginTop: 14, gap: 8 }}>
            {task.status === 'ASSIGNED' && btn(t('fwAcknowledge'), () => send(() => fieldWorkApi.acknowledge(id), t('fwSent')))}
            {!checkedIn && task.requireGps && <>{btn(busy ? t('fwFindingYou') : t('fwCheckIn'), () => mark('CHECK_IN'), true)}{btn(t('fwStartNoGps'), () => setMode('nogps'))}</>}
            {checkedIn && !checkedOut && btn(t('fwCheckOut'), () => mark('CHECK_OUT'))}
            {(checkedIn || !task.requireGps || task.status === 'IN_PROGRESS') && (isInspection ? btn(t('fwWriteInspection'), () => setMode('inspection'), true) : btn(t('fwReportWork'), () => setMode('report'), true))}
          </View>
        )}

        {mode === 'nogps' && (
          <View style={styles.card}>
            {input(reason, setReason, t('fwNoGpsReason'))}
            <View style={{ marginTop: 10, gap: 8 }}>
              {btn(t('fwStart'), () => send(() => fieldWorkApi.startWithoutGps(id, reason.trim()), t('fwSent')), true, !reason.trim())}
              {btn(t('fwBack'), () => setMode(null))}
            </View>
          </View>
        )}

        {mode === 'report' && (
          <View style={styles.card}>
            {input(rep.qty, (v) => setRep({ ...rep, qty: v }), t('fwHowMuch'), { keyboardType: 'numeric' })}
            {input(rep.unit, (v) => setRep({ ...rep, unit: v }), t('fwUnit'))}
            {input(rep.observations, (v) => setRep({ ...rep, observations: v }), t('fwObservations'), { multiline: true })}
            {input(rep.incomplete, (v) => setRep({ ...rep, incomplete: v }), t('fwNotFinished'))}
            <Text style={[styles.label, { marginTop: 12 }]}>{t('fwInputsUsed')}</Text>
            {used.map((u, i) => (
              <View key={i} style={{ marginTop: 6 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {inputs.filter((x) => x.isActive).map((x) => (
                    <TouchableOpacity key={x.id} style={[styles.chip, u.itemId === x.id && styles.chipOn]} onPress={() => setUsed((a) => a.map((y, k) => (k === i ? { ...y, itemId: x.id } : y)))}>
                      <Text style={[styles.chipText, u.itemId === x.id && { color: '#fff' }]}>{x.name} ({x.balance} {x.unit})</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {input(u.quantity, (v) => setUsed((a) => a.map((y, k) => (k === i ? { ...y, quantity: v } : y))), t('fwQuantity'), { keyboardType: 'numeric' })}
              </View>
            ))}
            <View style={{ marginTop: 8 }}>{btn(t('fwAddInput'), () => setUsed((a) => [...a, { itemId: '', quantity: '' }]))}</View>
            <View style={{ marginTop: 12, gap: 8 }}>
              {btn(t('fwSendForReview'), () => send(() => fieldWorkApi.report(id, { workDoneQty: rep.qty ? Number(rep.qty) : undefined, workDoneUnit: rep.unit || undefined, observations: rep.observations || undefined, incompleteReason: rep.incomplete || undefined, inputs: used.length ? used.map((u) => ({ itemId: u.itemId, quantity: Number(u.quantity) })) : undefined }), t('fwSent')), true,
                (!rep.observations.trim() && !rep.incomplete.trim()) || used.some((u) => !u.itemId || !(Number(u.quantity) > 0)))}
              {btn(t('fwBack'), () => setMode(null))}
            </View>
          </View>
        )}

        {mode === 'inspection' && (
          <View style={styles.card}>
            {input(insp.condition, (v) => setInsp({ ...insp, condition: v }), t('fwCropCondition'))}
            {input(insp.stage, (v) => setInsp({ ...insp, stage: v }), t('fwGrowthStage'))}
            {input(insp.pests, (v) => setInsp({ ...insp, pests: v }), t('fwPests'))}
            {input(insp.diseases, (v) => setInsp({ ...insp, diseases: v }), t('fwDiseases'))}
            {input(insp.observations, (v) => setInsp({ ...insp, observations: v }), t('fwObservations'), { multiline: true })}
            {input(insp.next, (v) => setInsp({ ...insp, next: v }), t('fwNextSteps'))}
            <View style={{ marginTop: 12, gap: 8 }}>
              {btn(t('fwSendForReview'), () => send(() => fieldWorkApi.inspection(id, { cropCondition: insp.condition || undefined, growthStage: insp.stage || undefined, pests: insp.pests || undefined, diseases: insp.diseases || undefined, observations: insp.observations || undefined, recommendations: insp.next.trim() ? [{ text: insp.next }] : undefined }), t('fwSent')), true, !(insp.condition.trim() || insp.observations.trim()))}
              {btn(t('fwBack'), () => setMode(null))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 18, fontWeight: '700', color: '#111827' },
  line: { fontSize: 13, color: '#374151', marginTop: 4 },
  label: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  input: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 10, marginTop: 4, fontSize: 14, color: '#111827' },
  btn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#10B981' },
  btnPlain: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB' },
  btnText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  chip: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#10B981', borderColor: '#10B981' },
  chipText: { fontSize: 12, color: '#111827' },
});
