import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Location01Icon, CheckmarkCircle02Icon, Camera01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { fieldSurveysApi, farmsApi, uploadsApi, resolveMediaUrl } from '../src/lib/data';
import { getCurrentPoint } from '../src/services/location.service';
import { useI18n } from '../src/i18n';
import { useAuthStore } from '../src/store/auth.store';

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'FIELD_OFFICER', 'MAMCOS_SECRETARY'];

interface Draft {
  soilPh: string; soilTexture: string; soilOrganicMatter: string; soilNotes: string;
  roadDistanceMeters: string; roadAccessQuality: string;
  waterSource: string; waterDistanceMeters: string; waterReliability: string;
  slope: string; floodRisk: string; observations: string;
  latitude: number | null; longitude: number | null;
}

const EMPTY_DRAFT: Draft = {
  soilPh: '', soilTexture: '', soilOrganicMatter: '', soilNotes: '',
  roadDistanceMeters: '', roadAccessQuality: '',
  waterSource: '', waterDistanceMeters: '', waterReliability: '',
  slope: '', floodRisk: '', observations: '',
  latitude: null, longitude: null,
};

/**
 * MAYODE field-data collection (prompt2 §15 / owner comment §13.7): GPS, soil,
 * road & water access captured on-site by a field officer. Saves an offline
 * draft to the device so a poor-connectivity visit isn't lost mid-form.
 */
export default function FieldSurveyScreen() {
  const { farmId, farmCode } = useLocalSearchParams<{ farmId: string; farmCode?: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuthStore();
  const draftKey = `mayode-field-survey-draft-${farmId}`;

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [capturingGps, setCapturingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey);
        if (raw) {
          setDraft(JSON.parse(raw));
          setDraftLoaded(true);
        }
      } catch {}
    })();
  }, [draftKey]);

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const saveDraft = async () => {
    await AsyncStorage.setItem(draftKey, JSON.stringify(draft));
    Alert.alert(t('fieldSurvey'), t('draftSaved'));
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
        name: asset.fileName || `field-survey-${Date.now()}.jpg`,
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
      await fieldSurveysApi.create(farmId!, {
        soilPh: draft.soilPh ? Number(draft.soilPh) : undefined,
        soilTexture: draft.soilTexture || undefined,
        soilOrganicMatter: draft.soilOrganicMatter ? Number(draft.soilOrganicMatter) : undefined,
        soilNotes: draft.soilNotes || undefined,
        roadDistanceMeters: draft.roadDistanceMeters ? Number(draft.roadDistanceMeters) : undefined,
        roadAccessQuality: draft.roadAccessQuality || undefined,
        waterSource: draft.waterSource || undefined,
        waterDistanceMeters: draft.waterDistanceMeters ? Number(draft.waterDistanceMeters) : undefined,
        waterReliability: draft.waterReliability || undefined,
        slope: draft.slope || undefined,
        floodRisk: draft.floodRisk || undefined,
        observations: draft.observations || undefined,
        latitude: draft.latitude ?? undefined,
        longitude: draft.longitude ?? undefined,
      });
      await Promise.all(photoUrls.map((url) => farmsApi.addPhoto(farmId!, {
        url,
        caption: t('fieldSurveyPhotoCaption'),
        latitude: draft.latitude ?? undefined,
        longitude: draft.longitude ?? undefined,
      })));
      await AsyncStorage.removeItem(draftKey);
      Alert.alert(t('fieldSurvey'), t('surveySubmitted'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('fieldSurvey'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || !STAFF_ROLES.includes(user.role)) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: t('fieldSurvey') }} />
        <View style={styles.center}><Text style={styles.staffOnly}>{t('staffOnlyFeature')}</Text></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('fieldSurvey') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {!!farmCode && <Text style={styles.farmLabel}>{farmCode}</Text>}
        {draftLoaded && <Text style={styles.hint}>{t('draftLoaded')}</Text>}

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
          <Text style={styles.sectionTitle}>{t('soilInformation')}</Text>
          <Field label={t('soilPh')} value={draft.soilPh} onChangeText={(v: string) => set('soilPh', v)} keyboardType="decimal-pad" />
          <Field label={t('soilTexture')} value={draft.soilTexture} onChangeText={(v: string) => set('soilTexture', v)} />
          <Field label={t('soilOrganicMatter')} value={draft.soilOrganicMatter} onChangeText={(v: string) => set('soilOrganicMatter', v)} keyboardType="decimal-pad" />
          <Field label={t('soilNotes')} value={draft.soilNotes} onChangeText={(v: string) => set('soilNotes', v)} multiline />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('roadAccessSection')}</Text>
          <Field label={t('roadDistanceMeters')} value={draft.roadDistanceMeters} onChangeText={(v: string) => set('roadDistanceMeters', v)} keyboardType="number-pad" />
          <Field label={t('roadAccessQuality')} value={draft.roadAccessQuality} onChangeText={(v: string) => set('roadAccessQuality', v)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('waterAccessSection')}</Text>
          <Field label={t('waterSource')} value={draft.waterSource} onChangeText={(v: string) => set('waterSource', v)} />
          <Field label={t('waterDistanceMeters')} value={draft.waterDistanceMeters} onChangeText={(v: string) => set('waterDistanceMeters', v)} keyboardType="number-pad" />
          <Field label={t('waterReliability')} value={draft.waterReliability} onChangeText={(v: string) => set('waterReliability', v)} />
        </View>

        <View style={styles.card}>
          <Field label={t('slopeLabel')} value={draft.slope} onChangeText={(v: string) => set('slope', v)} />
          <Field label={t('floodRiskLabel')} value={draft.floodRisk} onChangeText={(v: string) => set('floodRisk', v)} />
          <Field label={t('observationsLabel')} value={draft.observations} onChangeText={(v: string) => set('observations', v)} multiline />
        </View>

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
          <Text style={styles.submitText}>{t('submitSurvey')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.inputMultiline]}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  staffOnly: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  farmLabel: { fontSize: 18, fontWeight: '900', color: '#10B981', marginBottom: 6 },
  hint: { fontSize: 12, color: '#9CA3AF', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', paddingVertical: 13, borderRadius: 12 },
  gpsBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
