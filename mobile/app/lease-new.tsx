import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { leasesApi, seasonsApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

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
          <Field label={t('leaseStart')} value={start} onChangeText={setStart} placeholder="2026-11-01" />
          <Field label={t('leaseEnd')} value={end} onChangeText={setEnd} placeholder="2027-06-30" />
          <Text style={styles.hint}>{t('dateFormatHint')}</Text>
          <Field label={t('leaseNotes')} value={notes} onChangeText={setNotes} placeholder="" multiline />
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
});
