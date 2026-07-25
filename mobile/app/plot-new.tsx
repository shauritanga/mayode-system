import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { plotsApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

export default function PlotNew() {
  const { farmId, farmCode } = useLocalSearchParams<{ farmId: string; farmCode?: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [sizeAcres, setSizeAcres] = useState('');
  const [soilCondition, setSoilCondition] = useState('');
  const [irrigationStatus, setIrrigationStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!farmId) return;
    if (sizeAcres && isNaN(Number(sizeAcres))) {
      Alert.alert(t('invalidSize'), t('plotSizeNumber'));
      return;
    }
    setSaving(true);
    try {
      const res = await plotsApi.create({
        farmId,
        name: name || undefined,
        sizeAcres: sizeAcres ? Number(sizeAcres) : undefined,
        soilCondition: soilCondition || undefined,
        irrigationStatus: irrigationStatus || undefined,
      });
      const plot = res.data;
      Alert.alert(t('plotCreated'), t('plotAdded', { code: plot.plotCode }), [
        {
          text: t('walkBoundaryNow'),
          onPress: () =>
            router.replace({ pathname: '/boundary', params: { id: farmId, plotId: plot.id, label: t('plotContext', { code: plot.plotCode }) } }),
        },
        { text: t('done'), style: 'cancel', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t('failed'), e?.response?.data?.message || e?.message || t('couldNotCreatePlot'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('addPlot') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {!!farmCode && <Text style={styles.context}>{t('farmContext', { code: farmCode })}</Text>}

        <Field label={t('plotNameOptional')} value={name} onChangeText={setName} placeholder={t('plotNamePlaceholder')} />
        <Field label={t('sizeAcres')} value={sizeAcres} onChangeText={setSizeAcres} placeholder="e.g. 2.5" keyboardType="decimal-pad" />
        <Field label={t('soilConditionOptional')} value={soilCondition} onChangeText={setSoilCondition} placeholder={t('soilPlaceholder')} />
        <Field label={t('irrigationOptional')} value={irrigationStatus} onChangeText={setIrrigationStatus} placeholder={t('irrigationPlaceholder')} />

        <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>{t('createPlot')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#9CA3AF" {...rest} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  context: { fontSize: 14, fontWeight: '700', color: '#10B981', marginBottom: 14 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB', color: '#111827' },
  btn: { backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 8 },
  btnDisabled: { backgroundColor: '#9CA3AF' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
