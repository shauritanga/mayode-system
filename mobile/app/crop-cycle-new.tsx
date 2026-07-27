import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Calendar01Icon } from '@hugeicons/core-free-icons';
import { cropCyclesApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseDateInput(s: string | undefined): Date {
  const d = s ? new Date(s) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Start a crop cycle (owner comment: "record crop-cycle information" — a free feature). */
export default function CropCycleNew() {
  const { farmId, farmCode } = useLocalSearchParams<{ farmId: string; farmCode?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  const [season, setSeason] = useState('');
  const [riceVariety, setRiceVariety] = useState('');
  const [plantingDate, setPlantingDate] = useState('');
  const [expectedHarvest, setExpectedHarvest] = useState('');
  const [estimatedYieldKg, setEstimatedYieldKg] = useState('');
  const [pickerFor, setPickerFor] = useState<'plant' | 'harvest' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onPickDate = (event: any, selected?: Date) => {
    const field = pickerFor;
    setPickerFor(Platform.OS === 'ios' ? pickerFor : null);
    if (event.type === 'dismissed' || !selected || !field) return;
    if (field === 'plant') setPlantingDate(toDateInput(selected));
    else setExpectedHarvest(toDateInput(selected));
    if (Platform.OS === 'ios') setPickerFor(null);
  };

  const submit = async () => {
    if (!season.trim()) {
      Alert.alert(t('startCropCycle'), t('fillCropCycleFields'));
      return;
    }
    setSubmitting(true);
    try {
      await cropCyclesApi.create({
        farmId: farmId!,
        season: season.trim(),
        riceVariety: riceVariety.trim() || undefined,
        plantingDate: plantingDate || undefined,
        expectedHarvest: expectedHarvest || undefined,
        estimatedYieldKg: estimatedYieldKg ? Number(estimatedYieldKg) : undefined,
      });
      Alert.alert(t('startCropCycle'), t('cropCycleCreated'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('startCropCycle'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('startCropCycle') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {!!farmCode && <Text style={styles.farmLabel}>{farmCode}</Text>}

        <View style={styles.card}>
          <Field label={t('seasonLabel')} value={season} onChangeText={setSeason} placeholder="2026/2027 Masika" />
          <Field label={t('riceVariety')} value={riceVariety} onChangeText={setRiceVariety} placeholder="SARO 5 (TXD 306)" />

          <Text style={styles.fieldLabel}>{t('plantingDate')}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerFor('plant')}>
            <HugeiconsIcon icon={Calendar01Icon} size={16} color="#10B981" strokeWidth={2} />
            <Text style={styles.dateBtnText}>{plantingDate || t('dateFormatHint')}</Text>
          </TouchableOpacity>

          <Text style={styles.fieldLabel}>{t('expectedHarvestDate')}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerFor('harvest')}>
            <HugeiconsIcon icon={Calendar01Icon} size={16} color="#10B981" strokeWidth={2} />
            <Text style={styles.dateBtnText}>{expectedHarvest || t('dateFormatHint')}</Text>
          </TouchableOpacity>

          {pickerFor && (
            <DateTimePicker
              value={parseDateInput(pickerFor === 'plant' ? plantingDate : expectedHarvest)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onPickDate}
            />
          )}

          <Field label={t('estimatedYieldKg')} value={estimatedYieldKg} onChangeText={setEstimatedYieldKg} keyboardType="decimal-pad" />
        </View>

        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          <Text style={styles.submitText}>{t('startCropCycle')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, ...props }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#9CA3AF" {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  farmLabel: { fontSize: 18, fontWeight: '900', color: '#10B981', marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  dateBtnText: { fontSize: 14, color: '#111827' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
