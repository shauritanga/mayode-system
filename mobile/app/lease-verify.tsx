import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Camera01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { leasesApi, uploadsApi, resolveMediaUrl } from '../src/lib/data';
import { useI18n } from '../src/i18n';

const DECISIONS = ['VERIFIED', 'REJECTED', 'NEEDS_MORE_INFO', 'DISPUTED'] as const;
const METHODS = [
  'PHONE_CALL', 'IN_PERSON', 'VIDEO_CALL', 'DOCUMENT_REVIEW',
  'BLOCK_LEADER', 'CANAL_LEADER', 'COOPERATIVE_LEADER', 'NEIGHBOR',
] as const;

/** Field Officer / AMCOS Leader decision on a pending renter assignment. */
export default function LeaseVerify() {
  const { leaseId, farmCode, seasonName, renterName } = useLocalSearchParams<{
    leaseId: string; farmCode?: string; seasonName?: string; renterName?: string;
  }>();
  const router = useRouter();
  const { t } = useI18n();

  const [decision, setDecision] = useState<typeof DECISIONS[number]>('VERIFIED');
  const [method, setMethod] = useState<typeof METHODS[number]>('PHONE_CALL');
  const [contactedName, setContactedName] = useState('');
  const [contactedPhone, setContactedPhone] = useState('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const addEvidence = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const up = await uploadsApi.uploadFile({
        uri: asset.uri,
        name: asset.fileName || `verification-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      setEvidenceUrls((prev) => [...prev, up.data.url]);
    } finally {
      setUploading(false);
    }
  };

  const removeEvidence = (url: string) => {
    setEvidenceUrls((prev) => prev.filter((u) => u !== url));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      await leasesApi.officerVerify(leaseId!, {
        decision,
        method,
        contactedName: contactedName.trim() || undefined,
        contactedPhone: contactedPhone.trim() || undefined,
        evidenceUrls: evidenceUrls.length ? evidenceUrls : undefined,
        notes: notes.trim() || undefined,
      });
      Alert.alert(t('officerVerifyLease'), t('decisionSubmitted'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('officerVerifyLease'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('officerVerifyLease') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.farmLabel}>{farmCode}</Text>
          <Text style={styles.seasonLabel}>{seasonName} · {renterName}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('verificationDecision')}</Text>
          <View style={styles.chipRow}>
            {DECISIONS.map((d) => (
              <TouchableOpacity key={d} style={[styles.chip, decision === d && styles.chipActive]} onPress={() => setDecision(d)}>
                <Text style={[styles.chipText, decision === d && styles.chipTextActive]}>{d.replace(/_/g, ' ')}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{t('verificationMethod')}</Text>
          <View style={styles.chipRow}>
            {METHODS.map((m) => (
              <TouchableOpacity key={m} style={[styles.chip, method === m && styles.chipActive]} onPress={() => setMethod(m)}>
                <Text style={[styles.chipText, method === m && styles.chipTextActive]}>{m.replace(/_/g, ' ')}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>{t('contactedPerson')}</Text>
          <TextInput style={styles.input} value={contactedName} onChangeText={setContactedName}
            placeholder="e.g. Juma Mwakalinga (block leader)" placeholderTextColor="#9CA3AF" />

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('contactedPhone')}</Text>
          <TextInput style={styles.input} value={contactedPhone} onChangeText={setContactedPhone}
            placeholder="+255712345678" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('verificationEvidence')}</Text>
          <View style={styles.evidenceRow}>
            {evidenceUrls.map((url) => (
              <View key={url} style={styles.thumbWrap}>
                <Image source={{ uri: resolveMediaUrl(url) ?? url }} style={styles.thumb} />
                <TouchableOpacity style={styles.thumbRemove} onPress={() => removeEvidence(url)}>
                  <HugeiconsIcon icon={Cancel01Icon} size={12} color="#fff" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={styles.addThumb} onPress={addEvidence} disabled={uploading}>
              {uploading ? <ActivityIndicator size="small" color="#10B981" /> : (
                <HugeiconsIcon icon={Camera01Icon} size={20} color="#10B981" strokeWidth={2} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('verificationNotes')}</Text>
          <TextInput style={[styles.input, styles.inputMultiline]} value={notes} onChangeText={setNotes}
            multiline placeholderTextColor="#9CA3AF" />
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{submitting ? '…' : t('submitDecision')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  farmLabel: { fontSize: 18, fontWeight: '900', color: '#10B981' },
  seasonLabel: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#065F46', borderColor: '#065F46' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },
  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  addThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
