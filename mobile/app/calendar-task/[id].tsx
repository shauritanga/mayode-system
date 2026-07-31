import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { riceProtocolsApi, uploadsApi } from '../../src/lib/data';
import { useAuthStore } from '../../src/store/auth.store';

type Rule = { label: string; unit?: string; min?: number; max?: number };
type Task = { id: string; title: string; guidance: string; dueDate: string; status: string; evidenceRequired: boolean; requiredMeasurements?: Record<string, Rule>; measurements?: Record<string, string | number>; photoUrls?: string[]; completedAt?: string };

export default function CalendarTaskScreen() {
  const { id, cropCycleId } = useLocalSearchParams<{ id: string; cropCycleId: string }>();
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const [task, setTask] = useState<Task | null>(null);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [description, setDescription] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDueDate, setNewDueDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const canReschedule = !!role && ['SUPER_ADMIN', 'ADMIN', 'FIELD_OFFICER', 'MAMCOS_SECRETARY'].includes(role);

  const load = useCallback(async () => {
    if (!cropCycleId || !id) return;
    setLoading(true);
    try {
      const res = await riceProtocolsApi.tasks(cropCycleId);
      const next = res.data.find((item: Task) => item.id === id) ?? null;
      setTask(next);
      setMeasurements(Object.fromEntries(Object.entries(next?.measurements ?? {}).map(([key, value]) => [key, String(value)])));
      setPhotoUrl(next?.photoUrls?.[0] ?? null);
      setNewDueDate(next?.dueDate ? next.dueDate.slice(0, 10) : '');
    } finally { setLoading(false); }
  }, [cropCycleId, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert('Picha inahitajika', 'Ruhusu kamera ili kupiga picha ya uthibitisho.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    setSaving(true);
    try { const asset = result.assets[0]; const upload = await uploadsApi.uploadFile({ uri: asset.uri, name: asset.fileName || `mbalari-task-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' }); setPhotoUrl(upload.data.url); } finally { setSaving(false); }
  };
  const submit = async () => {
    if (!task) return;
    if (task.evidenceRequired && !photoUrl) { Alert.alert('Picha inahitajika', 'Piga picha kabla ya kukamilisha kazi hii.'); return; }
    setSaving(true);
    try {
      await riceProtocolsApi.completeTask(task.id, { measurements, photoUrls: photoUrl ? [photoUrl] : undefined, description: description.trim() || undefined });
      Alert.alert('Imekamilika', 'Kazi ya kalenda imerekodiwa.', [{ text: 'Sawa', onPress: () => router.back() }]);
    } catch (error: any) { const message = error?.response?.data?.message; Alert.alert('Haijakamilika', Array.isArray(message) ? message.join('\n') : message || 'Kagua vipimo vilivyojazwa.'); } finally { setSaving(false); }
  };
  const reschedule = async () => {
    if (!task || !newDueDate) return;
    setSaving(true);
    try {
      const res = await riceProtocolsApi.rescheduleTask(task.id, { dueDate: newDueDate, reason: rescheduleReason.trim() || undefined });
      setTask(res.data);
      setRescheduleOpen(false);
      Alert.alert('Ratiba imebadilishwa', 'Tarehe mpya ya kazi imehifadhiwa.');
    } catch (error: any) {
      const message = error?.response?.data?.message;
      Alert.alert('Haikuhifadhiwa', Array.isArray(message) ? message.join('\n') : message || 'Kagua tarehe na ujaribu tena.');
    } finally { setSaving(false); }
  };
  if (loading) return <SafeAreaView style={styles.center}><ActivityIndicator color="#10B981" /></SafeAreaView>;
  if (!task) return <SafeAreaView style={styles.center}><Text>Kazi haikupatikana.</Text></SafeAreaView>;
  const done = task.status === 'COMPLETED';
  return <SafeAreaView style={styles.container} edges={['bottom']}><Stack.Screen options={{ headerShown: true, title: 'Kazi ya Mbalari' }} /><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.card}><Text style={styles.title}>{task.title}</Text><Text style={styles.due}>Tarehe: {new Date(task.dueDate).toLocaleDateString('sw-TZ')}</Text><Text style={styles.guidance}>{task.guidance}</Text>{done && task.completedAt && <Text style={styles.doneNote}>Imekamilika: {new Date(task.completedAt).toLocaleDateString('sw-TZ')}</Text>}</View>
    {canReschedule && !done && <View style={styles.rescheduleCard}>
      <TouchableOpacity onPress={() => setRescheduleOpen((open) => !open)}><Text style={styles.rescheduleToggle}>{rescheduleOpen ? 'Ficha kubadili ratiba' : 'Badili tarehe ya kazi'}</Text></TouchableOpacity>
      {rescheduleOpen && <View><Text style={styles.label}>Tarehe mpya (YYYY-MM-DD)</Text><TextInput style={styles.input} value={newDueDate} onChangeText={setNewDueDate} placeholder="2027-02-15" /><Text style={styles.label}>Sababu</Text><TextInput style={[styles.input, styles.multi]} multiline value={rescheduleReason} onChangeText={setRescheduleReason} placeholder="Mfano: hatua ya zao kwa ushauri wa VBAA" /><TouchableOpacity disabled={saving} style={[styles.secondary, { marginTop: 12 }]} onPress={reschedule}><Text style={styles.secondaryText}>Hifadhi ratiba</Text></TouchableOpacity></View>}
    </View>}
    {Object.entries(task.requiredMeasurements ?? {}).map(([key, rule]) => <View key={key}><Text style={styles.label}>{rule.label}{rule.unit ? ` (${rule.unit})` : ''}</Text><TextInput editable={!done} style={styles.input} keyboardType="decimal-pad" value={measurements[key] ?? ''} onChangeText={(value) => setMeasurements((current) => ({ ...current, [key]: value }))} placeholder={rule.min != null || rule.max != null ? `${rule.min ?? 0}–${rule.max ?? '∞'}` : ''} /></View>)}
    <Text style={styles.label}>Maelezo</Text><TextInput editable={!done} style={[styles.input, styles.multi]} multiline value={description} onChangeText={setDescription} />
    {task.evidenceRequired && <><Text style={styles.label}>Picha ya uthibitisho</Text>{photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photo} /> : <TouchableOpacity disabled={saving || done} style={styles.secondary} onPress={addPhoto}><Text style={styles.secondaryText}>Piga picha</Text></TouchableOpacity>}</>}
    {!done && <TouchableOpacity disabled={saving} style={[styles.submit, saving && { opacity: 0.65 }]} onPress={submit}>{saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Kamilisha kazi</Text>}</TouchableOpacity>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#F3F4F6' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: 16 }, card: { backgroundColor: '#ECFDF5', borderRadius: 16, padding: 16, marginBottom: 16 }, rescheduleCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#D1FAE5' }, title: { fontSize: 20, fontWeight: '900', color: '#064E3B' }, due: { fontSize: 12, color: '#047857', marginTop: 5 }, guidance: { color: '#374151', lineHeight: 21, marginTop: 12 }, doneNote: { color: '#047857', fontWeight: '800', marginTop: 12 }, rescheduleToggle: { color: '#047857', fontWeight: '900' }, label: { color: '#374151', fontWeight: '800', fontSize: 13, marginBottom: 6, marginTop: 12 }, input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 12, color: '#111827' }, multi: { minHeight: 80, textAlignVertical: 'top' }, secondary: { borderWidth: 1, borderColor: '#10B981', borderRadius: 12, padding: 12, alignItems: 'center', backgroundColor: '#fff' }, secondaryText: { color: '#047857', fontWeight: '800' }, photo: { width: '100%', height: 190, borderRadius: 12 }, submit: { marginTop: 22, backgroundColor: '#065F46', borderRadius: 12, padding: 14, alignItems: 'center' }, submitText: { color: '#fff', fontWeight: '900' } });
