import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Camera01Icon, CheckmarkCircle02Icon, SecurityCheckIcon, Alert02Icon } from '@hugeicons/core-free-icons';
import { farmersApi, uploadsApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { useI18n, TranslationKey } from '../src/i18n';

type IdType = 'NIDA_ID' | 'VOTER_ID';

export default function IdentityScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const farmerId = useAuthStore((s) => s.farmerId);

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [idType, setIdType] = useState<IdType>('NIDA_ID');
  const [idNumber, setIdNumber] = useState('');
  const [idPhoto, setIdPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [selfie, setSelfie] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!farmerId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await farmersApi.getOne(farmerId);
      setStatus(res.data?.verificationStatus ?? null);
    } finally {
      setLoading(false);
    }
  }, [farmerId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const capture = async (front: boolean, set: (a: ImagePicker.ImagePickerAsset) => void) => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('identityVerification'), t('cameraPermissionNeeded'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      cameraType: front ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
    });
    if (!result.canceled && result.assets?.length) set(result.assets[0]);
  };

  const submit = async () => {
    if (!farmerId) return;
    if (!idNumber.trim() || !idPhoto || !selfie) {
      Alert.alert(t('identityVerification'), t('fillIdFields'));
      return;
    }
    setSubmitting(true);
    try {
      const [idUp, selfieUp] = await Promise.all([
        uploadsApi.uploadFile({ uri: idPhoto.uri, name: idPhoto.fileName || `id-${Date.now()}.jpg`, type: idPhoto.mimeType || 'image/jpeg' }),
        uploadsApi.uploadFile({ uri: selfie.uri, name: selfie.fileName || `selfie-${Date.now()}.jpg`, type: selfie.mimeType || 'image/jpeg' }),
      ]);
      await farmersApi.submitIdentity(farmerId, {
        idType,
        idNumber: idNumber.trim(),
        idDocumentUrl: idUp.data.url,
        faceCaptureUrl: selfieUp.data.url,
      });
      Alert.alert(t('identityVerification'), t('identitySubmitted'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
      await load();
    } catch (e: any) {
      Alert.alert(t('identityVerification'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  const statusBanner = () => {
    if (status === 'VERIFIED') return { color: '#10B981', bg: '#F0FDF9', icon: CheckmarkCircle02Icon, text: t('verificationVerified') };
    if (status === 'PENDING') return { color: '#F59E0B', bg: '#FFFBEB', icon: SecurityCheckIcon, text: t('verificationPending') };
    if (status === 'REJECTED') return { color: '#EF4444', bg: '#FEF2F2', icon: Alert02Icon, text: t('verificationRejected') };
    return null;
  };

  const banner = statusBanner();
  // Verified users are done; pending users wait; everyone else (new/rejected) can submit.
  const canSubmit = status !== 'VERIFIED' && status !== 'PENDING';

  if (loading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color="#10B981" size="large" /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('identityVerification') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {banner && (
          <View style={[styles.banner, { backgroundColor: banner.bg }]}>
            <HugeiconsIcon icon={banner.icon} size={20} color={banner.color} strokeWidth={2} />
            <Text style={[styles.bannerText, { color: banner.color }]}>{banner.text}</Text>
          </View>
        )}

        {canSubmit && (
          <>
            <Text style={styles.intro}>{t('identityIntro')}</Text>

            {/* ID type */}
            <Text style={styles.label}>{t('idType')}</Text>
            <View style={styles.segment}>
              {(['NIDA_ID', 'VOTER_ID'] as IdType[]).map((tp) => (
                <TouchableOpacity
                  key={tp}
                  style={[styles.segmentBtn, idType === tp && styles.segmentBtnActive]}
                  onPress={() => setIdType(tp)}
                >
                  <Text style={[styles.segmentText, idType === tp && styles.segmentTextActive]}>
                    {tp === 'NIDA_ID' ? t('nidaId') : t('voterId')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ID number */}
            <Text style={styles.label}>{t('idNumber')}</Text>
            <TextInput
              style={styles.input}
              value={idNumber}
              onChangeText={setIdNumber}
              placeholder="19900101-12345-00001-23"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
            />

            {/* ID photo */}
            <Text style={styles.label}>{t('idPhoto')}</Text>
            <CaptureTile
              asset={idPhoto}
              label={t('captureIdPhoto')}
              onPress={() => capture(false, setIdPhoto)}
              retakeLabel={t('retake')}
            />

            {/* Selfie / guided face capture */}
            <Text style={styles.label}>{t('faceCapture')}</Text>
            <Text style={styles.hint}>{t('faceCaptureHint')}</Text>
            <CaptureTile
              asset={selfie}
              label={t('captureSelfie')}
              onPress={() => capture(true, setSelfie)}
              retakeLabel={t('retake')}
              round
            />

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>{status === 'REJECTED' ? t('resubmit') : t('submitForReview')}</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function CaptureTile({
  asset, label, onPress, retakeLabel, round,
}: {
  asset: ImagePicker.ImagePickerAsset | null; label: string; onPress: () => void; retakeLabel: string; round?: boolean;
}) {
  if (asset) {
    return (
      <View style={styles.previewWrap}>
        <Image source={{ uri: asset.uri }} style={[styles.preview, round && styles.previewRound]} />
        <TouchableOpacity style={styles.retakeBtn} onPress={onPress}>
          <HugeiconsIcon icon={Camera01Icon} size={15} color="#10B981" strokeWidth={2} />
          <Text style={styles.retakeText}>{retakeLabel}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <TouchableOpacity style={[styles.captureTile, round && styles.captureTileRound]} onPress={onPress}>
      <HugeiconsIcon icon={Camera01Icon} size={26} color="#10B981" strokeWidth={1.8} />
      <Text style={styles.captureText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, marginBottom: 16 },
  bannerText: { fontSize: 14, fontWeight: '700', flex: 1 },
  intro: { fontSize: 14, color: '#4B5563', lineHeight: 21, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 18, marginBottom: 8 },
  hint: { fontSize: 12, color: '#6B7280', marginTop: -4, marginBottom: 8, lineHeight: 18 },
  segment: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  segmentTextActive: { color: '#065F46' },
  input: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: '#111827' },
  captureTile: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#A7F3D0', borderStyle: 'dashed', paddingVertical: 28, alignItems: 'center', gap: 8 },
  captureTileRound: {},
  captureText: { fontSize: 14, fontWeight: '700', color: '#10B981' },
  previewWrap: { alignItems: 'center' },
  preview: { width: '100%', height: 200, borderRadius: 14, backgroundColor: '#E5E7EB' },
  previewRound: { width: 160, height: 160, borderRadius: 80 },
  retakeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: 'rgba(16,185,129,0.12)', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10 },
  retakeText: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginTop: 24 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
