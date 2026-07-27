import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Calendar01Icon, Camera01Icon, Location01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { cropCyclesApi, uploadsApi } from '../src/lib/data';
import { getCurrentPoint } from '../src/services/location.service';
import { useI18n } from '../src/i18n';

const ACTIVITY_TYPES = [
  { key: 'LAND_PREPARATION', labelKey: 'activityLandPreparation', icon: '🚜' },
  { key: 'PLANTING', labelKey: 'activityPlanting', icon: '🌱' },
  { key: 'FERTILIZING', labelKey: 'activityFertilizing', icon: '🧪' },
  { key: 'WEEDING', labelKey: 'activityWeeding', icon: '🌿' },
  { key: 'PEST_CONTROL', labelKey: 'activityPestControl', icon: '🐛' },
  { key: 'IRRIGATION', labelKey: 'activityIrrigation', icon: '💧' },
  { key: 'HARVESTING', labelKey: 'activityHarvesting', icon: '🌾' },
  { key: 'DRYING', labelKey: 'activityDrying', icon: '☀️' },
  { key: 'STORAGE', labelKey: 'activityStorage', icon: '📦' },
  { key: 'TRANSPORT', labelKey: 'activityTransport', icon: '🚚' },
] as const;

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Log a farming activity (owner comment: "record farm activities" — a free feature). */
export default function ActivityNew() {
  const { cropCycleId, farmCode, season } = useLocalSearchParams<{ cropCycleId: string; farmCode?: string; season?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const [activityType, setActivityType] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInput(new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const [description, setDescription] = useState('');
  const [laborWorkers, setLaborWorkers] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [capturingGps, setCapturingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onPickDate = (event: any, selected?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (event.type === 'dismissed' || !selected) return;
    setDate(toDateInput(selected));
  };

  const addPhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const up = await uploadsApi.uploadFile({
        uri: asset.uri,
        name: asset.fileName || `activity-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      setPhotoUrl(up.data.url);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const captureGps = async () => {
    setCapturingGps(true);
    try {
      const p = await getCurrentPoint();
      setGps(p);
    } catch (e: any) {
      Alert.alert(t('captureLocation'), String(e?.message ?? e));
    } finally {
      setCapturingGps(false);
    }
  };

  const submit = async () => {
    if (!activityType || !date) {
      Alert.alert(t('logActivity'), t('fillActivityFields'));
      return;
    }
    setSubmitting(true);
    try {
      await cropCyclesApi.logActivity({
        cropCycleId: cropCycleId!,
        activityType,
        activityDate: date,
        description: description.trim() || undefined,
        laborWorkers: laborWorkers ? Number(laborWorkers) : undefined,
        laborHours: laborHours ? Number(laborHours) : undefined,
        photoUrls: photoUrl ? [photoUrl] : undefined,
        gpsLatitude: gps?.latitude,
        gpsLongitude: gps?.longitude,
      });
      Alert.alert(t('logActivity'), t('activityLogged'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('logActivity'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('logActivity') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {(!!farmCode || !!season) && <Text style={styles.contextLabel}>{[farmCode, season].filter(Boolean).join(' · ')}</Text>}

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('selectActivityType')}</Text>
          <View style={styles.chipsWrap}>
            {ACTIVITY_TYPES.map((a) => (
              <TouchableOpacity
                key={a.key}
                style={[styles.chip, activityType === a.key && styles.chipActive]}
                onPress={() => setActivityType(a.key)}
              >
                <Text style={styles.chipEmoji}>{a.icon}</Text>
                <Text style={[styles.chipText, activityType === a.key && styles.chipTextActive]}>{t(a.labelKey)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{t('activityDate')}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
            <HugeiconsIcon icon={Calendar01Icon} size={16} color="#10B981" strokeWidth={2} />
            <Text style={styles.dateBtnText}>{date}</Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={new Date(date)}
              mode="date"
              maximumDate={new Date()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onPickDate}
            />
          )}

          <Text style={styles.fieldLabel}>{t('activityDescription')}</Text>
          <TextInput style={[styles.input, styles.inputMultiline]} value={description} onChangeText={setDescription} multiline placeholderTextColor="#9CA3AF" />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('laborWorkers')}</Text>
              <TextInput style={styles.input} value={laborWorkers} onChangeText={setLaborWorkers} keyboardType="number-pad" placeholderTextColor="#9CA3AF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('laborHours')}</Text>
              <TextInput style={styles.input} value={laborHours} onChangeText={setLaborHours} keyboardType="decimal-pad" placeholderTextColor="#9CA3AF" />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('addActivityPhoto')}</Text>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.photoPreview} />
          ) : (
            <TouchableOpacity style={styles.secondaryBtn} onPress={addPhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? <ActivityIndicator size="small" color="#10B981" /> : (
                <><HugeiconsIcon icon={Camera01Icon} size={16} color="#10B981" strokeWidth={2} />
                <Text style={styles.secondaryBtnText}>{t('addActivityPhoto')}</Text></>
              )}
            </TouchableOpacity>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('captureLocation')}</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={captureGps} disabled={capturingGps}>
            {capturingGps ? <ActivityIndicator size="small" color="#10B981" /> : (
              <><HugeiconsIcon icon={gps ? CheckmarkCircle02Icon : Location01Icon} size={16} color="#10B981" strokeWidth={2} />
              <Text style={styles.secondaryBtnText}>{gps ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}` : t('captureLocation')}</Text></>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{t('logActivity')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  contextLabel: { fontSize: 13, color: '#6B7280', marginBottom: 12, fontWeight: '600' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 12 },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#065F46', borderColor: '#065F46' },
  chipEmoji: { fontSize: 14 },
  chipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  dateBtnText: { fontSize: 14, color: '#111827' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 13, color: '#111827' },
  photoPreview: { width: 96, height: 96, borderRadius: 12 },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
