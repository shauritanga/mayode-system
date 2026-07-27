import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Calendar01Icon, File01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { leasesApi, seasonsApi, uploadsApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseDateInput(s: string | undefined): Date {
  const d = s ? new Date(s) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

interface Season { id: string; name: string }

/** Owner "Add Lease" — names a renter for a farm and season (owner comment §13.3). */
export default function LeaseNew() {
  const { farmId, farmCode } = useLocalSearchParams<{ farmId: string; farmCode: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const [season, setSeason] = useState<Season | null>(null);
  const [loadingSeason, setLoadingSeason] = useState(true);
  const [renterName, setRenterName] = useState('');
  const [renterPhone, setRenterPhone] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pickerFor, setPickerFor] = useState<'start' | 'end' | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  const loadSeason = useCallback(async () => {
    setLoadingSeason(true);
    try {
      const res = await seasonsApi.current();
      setSeason(res.data ?? null);
      // Prefill lease dates from the season window when available.
      if (res.data?.startDate) setStart(String(res.data.startDate).slice(0, 10));
      if (res.data?.endDate) setEnd(String(res.data.endDate).slice(0, 10));
    } finally {
      setLoadingSeason(false);
    }
  }, []);

  useEffect(() => { loadSeason(); }, [loadSeason]);

  const onPickDate = (event: any, selected?: Date) => {
    const field = pickerFor;
    setPickerFor(Platform.OS === 'ios' ? pickerFor : null);
    if (event.type === 'dismissed' || !selected || !field) return;
    if (field === 'start') setStart(toDateInput(selected));
    else setEnd(toDateInput(selected));
    if (Platform.OS === 'ios') setPickerFor(null);
  };

  const attachDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingDoc(true);
    try {
      const up = await uploadsApi.uploadFile({
        uri: asset.uri,
        name: asset.name || `lease-agreement-${Date.now()}`,
        type: asset.mimeType || 'application/octet-stream',
      });
      setDocumentUrl(up.data.url);
      setDocumentName(asset.name || t('documentAttached'));
    } catch (e: any) {
      Alert.alert(t('attachDocument'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setUploadingDoc(false);
    }
  };

  const submit = async () => {
    if (!renterPhone.trim() || !start.trim() || !end.trim()) {
      Alert.alert(t('addLease'), t('fillAllLeaseFields'));
      return;
    }
    if (!season?.id) {
      Alert.alert(t('addLease'), t('noCurrentSeason'));
      return;
    }
    setSubmitting(true);
    try {
      await leasesApi.create({
        farmId: farmId!,
        farmingSeasonId: season.id,
        renterPhone: renterPhone.trim(),
        renterName: renterName.trim() || undefined,
        leaseStartDate: start.trim(),
        leaseEndDate: end.trim(),
        notes: notes.trim() || undefined,
        agreementDocumentUrl: documentUrl || undefined,
      });
      Alert.alert(t('addLease'), t('leaseCreated'), [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('addLease'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('addLease') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.farmLabel}>{farmCode}</Text>
          {loadingSeason ? (
            <ActivityIndicator color="#10B981" style={{ marginTop: 8 }} />
          ) : (
            <Text style={styles.seasonLabel}>
              {t('seasonLabel')}: {season?.name ?? t('noCurrentSeason')}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Field label={t('renterPhone')} value={renterPhone} onChangeText={setRenterPhone}
            placeholder="+255712345678" keyboardType="phone-pad" />
          <Field label={t('renterName')} value={renterName} onChangeText={setRenterName} placeholder="John Mushi" />

          <Text style={styles.fieldLabel}>{t('leaseStart')}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerFor('start')}>
            <HugeiconsIcon icon={Calendar01Icon} size={16} color="#10B981" strokeWidth={2} />
            <Text style={styles.dateBtnText}>{start || t('dateFormatHint')}</Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>{t('leaseEnd')}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerFor('end')}>
            <HugeiconsIcon icon={Calendar01Icon} size={16} color="#10B981" strokeWidth={2} />
            <Text style={styles.dateBtnText}>{end || t('dateFormatHint')}</Text>
          </TouchableOpacity>

          {pickerFor && (
            <DateTimePicker
              value={parseDateInput(pickerFor === 'start' ? start : end)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onPickDate}
            />
          )}

          <Field label={t('leaseNotes')} value={notes} onChangeText={setNotes} placeholder="" multiline />

          <Text style={styles.fieldLabel}>{t('attachAgreement')}</Text>
          {documentUrl ? (
            <View style={styles.docRow}>
              <HugeiconsIcon icon={File01Icon} size={16} color="#10B981" strokeWidth={2} />
              <Text style={styles.docName} numberOfLines={1}>{documentName}</Text>
              <TouchableOpacity onPress={() => { setDocumentUrl(null); setDocumentName(null); }}>
                <HugeiconsIcon icon={Cancel01Icon} size={16} color="#9CA3AF" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.dateBtn} onPress={attachDocument} disabled={uploadingDoc}>
              {uploadingDoc ? <ActivityIndicator size="small" color="#10B981" /> : (
                <><HugeiconsIcon icon={File01Icon} size={16} color="#10B981" strokeWidth={2} />
                <Text style={styles.dateBtnText}>{t('attachDocument')}</Text></>
              )}
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting}
        >
          <Text style={styles.submitText}>{t('createLease')}</Text>
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
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  farmLabel: { fontSize: 18, fontWeight: '900', color: '#10B981' },
  seasonLabel: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  hint: { fontSize: 11, color: '#9CA3AF', marginTop: -6, marginBottom: 12 },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  dateBtnText: { fontSize: 14, color: '#111827' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5', borderRadius: 12, borderWidth: 1, borderColor: '#A7F3D0', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  docName: { flex: 1, fontSize: 13, color: '#065F46', fontWeight: '600' },
});
