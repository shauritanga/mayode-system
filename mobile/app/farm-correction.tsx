import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Camera01Icon } from '@hugeicons/core-free-icons';
import { correctionsApi, uploadsApi, resolveMediaUrl } from '../src/lib/data';
import { useI18n } from '../src/i18n';

/** Farm fields a farmer/renter may propose a correction for — mirrors the
 * backend's EDITABLE_FARM_FIELDS whitelist (never applied automatically). */
const EDITABLE_FIELDS = [
  { key: 'name', label: 'Farm name' },
  { key: 'plotNumber', label: 'Plot number' },
  { key: 'blockNumber', label: 'Block number' },
  { key: 'section', label: 'Section / direction' },
  { key: 'village', label: 'Village' },
  { key: 'ward', label: 'Ward' },
  { key: 'district', label: 'District' },
  { key: 'region', label: 'Region' },
  { key: 'socialHectares', label: 'Farm size (hectares)' },
  { key: 'ownerName', label: 'Owner name' },
  { key: 'ownerPhone', label: 'Owner phone number' },
  { key: 'waterSource', label: 'Water source' },
  { key: 'soilType', label: 'Soil type' },
  { key: 'soilCondition', label: 'Soil condition' },
  { key: 'accessibility', label: 'Accessibility' },
];

/** "Suggest a correction" (prompt2 §19): never overwrites farm data directly — held for officer review. */
export default function FarmCorrectionScreen() {
  const { farmId, farmCode } = useLocalSearchParams<{ farmId: string; farmCode?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const [fieldName, setFieldName] = useState<string | null>(null);
  const [suggestedValue, setSuggestedValue] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addEvidence = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const up = await uploadsApi.uploadFile({
        uri: asset.uri,
        name: asset.fileName || `correction-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      setPhotoUrl(up.data.url);
    } catch (e: any) {
      Alert.alert(t('suggestCorrection'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const submit = async () => {
    if (!fieldName || !suggestedValue.trim()) {
      Alert.alert(t('suggestCorrection'), t('fillCorrectionFields'));
      return;
    }
    setSubmitting(true);
    try {
      await correctionsApi.submit(farmId!, {
        fieldName,
        suggestedValue: suggestedValue.trim(),
        evidenceUrls: photoUrl ? [photoUrl] : undefined,
      });
      Alert.alert(t('suggestCorrection'), t('correctionSubmitted'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('suggestCorrection'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('suggestCorrection') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {!!farmCode && <Text style={styles.farmLabel}>{farmCode}</Text>}

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('fieldToCorrect')}</Text>
          <View style={styles.chipsWrap}>
            {EDITABLE_FIELDS.map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[styles.chip, fieldName === f.key && styles.chipActive]}
                onPress={() => setFieldName(f.key)}
              >
                <Text style={[styles.chipText, fieldName === f.key && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{t('suggestedValueLabel')}</Text>
          <TextInput
            style={styles.input}
            value={suggestedValue}
            onChangeText={setSuggestedValue}
            placeholder=""
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.fieldLabel}>{t('correctionEvidence')}</Text>
          {photoUrl ? (
            <Image source={{ uri: resolveMediaUrl(photoUrl) ?? photoUrl }} style={styles.evidencePreview} />
          ) : (
            <TouchableOpacity style={styles.evidenceBtn} onPress={addEvidence} disabled={uploadingPhoto}>
              {uploadingPhoto ? <ActivityIndicator size="small" color="#10B981" /> : (
                <><HugeiconsIcon icon={Camera01Icon} size={16} color="#10B981" strokeWidth={2} />
                <Text style={styles.evidenceBtnText}>{t('correctionEvidence')}</Text></>
              )}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>{t('submitCorrection')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  farmLabel: { fontSize: 18, fontWeight: '900', color: '#10B981', marginBottom: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 12 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#065F46', borderColor: '#065F46' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },
  evidenceBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12 },
  evidenceBtnText: { fontSize: 14, color: '#111827' },
  evidencePreview: { width: 96, height: 96, borderRadius: 12 },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
