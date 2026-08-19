import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Location01Icon, CheckmarkCircle02Icon, Camera01Icon, Cancel01Icon, TaskDaily01Icon } from '@hugeicons/core-free-icons';
import { officerVisitsApi, uploadsApi, resolveMediaUrl } from '../../src/lib/data';
import { getCurrentPoint } from '../../src/services/location.service';
import { useI18n } from '../../src/i18n';

const PURPOSES = [
  { key: 'ROUTINE_CHECK', labelKey: 'purposeRoutineCheck' },
  { key: 'FARMING_ASSISTANCE', labelKey: 'purposeFarmingAssistance' },
  { key: 'VERIFICATION', labelKey: 'purposeVerification' },
  { key: 'DISPUTE_FOLLOWUP', labelKey: 'purposeDisputeFollowup' },
  { key: 'TRAINING', labelKey: 'purposeTraining' },
  { key: 'OTHER', labelKey: 'purposeOther' },
] as const;

interface Draft {
  purpose: string;
  notes: string;
  latitude: number | null;
  longitude: number | null;
}

const EMPTY_DRAFT: Draft = { purpose: 'ROUTINE_CHECK', notes: '', latitude: null, longitude: null };

export default function OfficerVisitNewScreen() {
  const { farmerId, farmerName, farmId, cropCycleId } = useLocalSearchParams<{
    farmerId: string; farmerName?: string; farmId?: string; cropCycleId?: string;
  }>();
  const router = useRouter();
  const { t } = useI18n();
  const draftKey = `mayode-officer-visit-draft-${farmerId}`;

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [capturingGps, setCapturingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey);
        if (raw) setDraft(JSON.parse(raw));
      } catch {}
    })();
  }, [draftKey]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const saveDraft = async () => {
    await AsyncStorage.setItem(draftKey, JSON.stringify(draft));
    Alert.alert(t('logVisit'), t('draftSaved'));
  };

  const captureGps = async () => {
    setCapturingGps(true);
    try {
      const p = await getCurrentPoint();
      set('latitude', p.latitude);
      set('longitude', p.longitude);
    } catch (e: any) {
      Alert.alert(t('captureGps'), String(e?.message ?? e));
    } finally {
      setCapturingGps(false);
    }
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
        name: asset.fileName || `visit-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      setPhotoUrls((prev) => [...prev, up.data.url]);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const removePhoto = (url: string) => {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await officerVisitsApi.create({
        farmerId: farmerId!,
        farmId: farmId || undefined,
        cropCycleId: cropCycleId || undefined,
        purpose: draft.purpose as any,
        notes: draft.notes || undefined,
        photoUrls,
        gpsLatitude: draft.latitude ?? undefined,
        gpsLongitude: draft.longitude ?? undefined,
      });
      await AsyncStorage.removeItem(draftKey);
      Alert.alert(t('logVisit'), t('visitSubmitted'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('logVisit'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('logVisit') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {!!farmerName && <Text style={styles.farmerLabel}>{farmerName}</Text>}

        <View style={styles.card}>
          <TouchableOpacity style={styles.gpsBtn} onPress={captureGps} disabled={capturingGps}>
            {capturingGps ? <ActivityIndicator size="small" color="#fff" /> : (
              <HugeiconsIcon icon={draft.latitude ? CheckmarkCircle02Icon : Location01Icon} size={18} color="#fff" strokeWidth={2} />
            )}
            <Text style={styles.gpsBtnText}>
              {draft.latitude ? `${t('gpsCaptured')}: ${draft.latitude.toFixed(5)}, ${draft.longitude!.toFixed(5)}` : t('captureGps')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('visitPurpose')}</Text>
          <View style={styles.chipRow}>
            {PURPOSES.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.chip, draft.purpose === p.key && styles.chipActive]}
                onPress={() => set('purpose', p.key)}
              >
                <Text style={[styles.chipText, draft.purpose === p.key && styles.chipTextActive]}>{t(p.labelKey as any)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('visitNotes')}</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholderTextColor="#9CA3AF"
            multiline
            value={draft.notes}
            onChangeText={(v) => set('notes', v)}
          />
        </View>

        {!!cropCycleId && (
          <TouchableOpacity
            style={styles.assistBtn}
            onPress={() => router.push({ pathname: '/activity-new', params: { cropCycleId, farmId } })}
          >
            <HugeiconsIcon icon={TaskDaily01Icon} size={18} color="#065F46" strokeWidth={2} />
            <Text style={styles.assistBtnText}>{t('helpWithActivity')}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('surveyPhotos')}</Text>
          <View style={styles.photoRow}>
            {photoUrls.map((url) => (
              <View key={url} style={styles.thumbWrap}>
                <Image source={{ uri: resolveMediaUrl(url) ?? url }} style={styles.thumb} />
                <TouchableOpacity style={styles.thumbRemove} onPress={() => removePhoto(url)}>
                  <HugeiconsIcon icon={Cancel01Icon} size={12} color="#fff" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addThumb} onPress={addPhoto} disabled={uploadingPhoto}>
              {uploadingPhoto ? <ActivityIndicator size="small" color="#10B981" /> : (
                <HugeiconsIcon icon={Camera01Icon} size={20} color="#10B981" strokeWidth={2} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.draftBtn} onPress={saveDraft}>
          <Text style={styles.draftBtnText}>{t('saveDraft')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{t('logVisit')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  farmerLabel: { fontSize: 18, fontWeight: '900', color: '#10B981', marginBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 10 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', paddingVertical: 13, borderRadius: 12 },
  gpsBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#065F46', borderColor: '#065F46' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },
  assistBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 14, paddingVertical: 13, marginBottom: 14 },
  assistBtnText: { color: '#065F46', fontWeight: '700', fontSize: 14 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  addThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  draftBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#065F46', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  draftBtnText: { color: '#065F46', fontWeight: '800', fontSize: 15 },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
