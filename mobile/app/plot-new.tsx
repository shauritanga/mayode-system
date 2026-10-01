import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getCurrentPoint } from '../src/services/location.service';
import { plotsApi, uploadsApi, resolveMediaUrl } from '../src/lib/data';
import { useI18n } from '../src/i18n';

export default function PlotNew() {
  const { farmId, farmCode } = useLocalSearchParams<{ farmId: string; farmCode?: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [sizeAcres, setSizeAcres] = useState('');
  const [soilCondition, setSoilCondition] = useState('');
  const [irrigationStatus, setIrrigationStatus] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);

  const capture = async (camera: boolean) => {
    setCapturing(true);
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) { Alert.alert(t('cameraPermissionNeeded')); return; }
      const result = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.75 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.75 });
      if (!result.canceled) {
        const asset = result.assets[0];
        const res = await uploadsApi.uploadFile({ uri: asset.uri, name: asset.fileName || 'plot.jpg', type: asset.mimeType || 'image/jpeg' });
        setPhotoUrl(res.data.url);
      }
    } catch (e: any) { Alert.alert(t('error'), e.message); }
    finally { setCapturing(false); }
  };
  const locate = async () => {
    try { setGps(await getCurrentPoint()); } catch (e: any) { Alert.alert(t('error'), e.message); }
  };
  const submit = async () => {
    if (!farmId) return;
    if (!gps || !photoUrl) { Alert.alert(t("validationError"), t("plotPhotoRequired")); return; }
    if (sizeAcres && (!Number.isFinite(Number(sizeAcres)) || Number(sizeAcres) <= 0)) {
      Alert.alert(t('invalidSize'), t('plotSizeNumber'));
      return;
    }
    setSaving(true);
    try {
      const res = await plotsApi.create({
        farmId,
        photoUrls: [photoUrl],
        centerLatitude: gps.latitude,
        centerLongitude: gps.longitude,
        name: name || undefined,
        sizeAcres: sizeAcres ? Number(sizeAcres) : undefined,
        soilCondition: soilCondition || undefined,
        irrigationStatus: irrigationStatus || undefined,
      });
      const plot = res.data;
      Alert.alert(t('plotCreated'), plot.queued ? t('savedOffline') : t('plotAdded', { code: plot.plotCode }), [
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

        <Text style={styles.label}>{t('plotPhoto')}</Text>
        {photoUrl && <Image source={{ uri: resolveMediaUrl(photoUrl) || photoUrl }} style={{ width: '100%', height: 180, borderRadius: 12 }} />}
        <TouchableOpacity disabled={capturing} onPress={() => { void capture(true); }} style={styles.btn}><Text style={styles.btnText}>{t('takePhoto')}</Text></TouchableOpacity>
        <TouchableOpacity disabled={capturing} onPress={() => { void capture(false); }} style={styles.btn}><Text style={styles.btnText}>{t('chooseFromGallery')}</Text></TouchableOpacity>
        <TouchableOpacity onPress={locate} style={styles.btn}><Text style={styles.btnText}>{t('captureLocation')}</Text></TouchableOpacity>
        {gps && <Text>{gps.latitude.toFixed(6)}, {gps.longitude.toFixed(6)}</Text>}
        <Field label={t('plotNameOptional')} value={name} onChangeText={setName} placeholder={t('plotNamePlaceholder')} />
        <Field label={t('sizeAcres')} value={sizeAcres} onChangeText={setSizeAcres} placeholder="e.g. 2.5" keyboardType="decimal-pad" />
        <Field label={t('soilConditionOptional')} value={soilCondition} onChangeText={setSoilCondition} placeholder={t('soilPlaceholder')} />
        <Field label={t('irrigationOptional')} value={irrigationStatus} onChangeText={setIrrigationStatus} placeholder={t('irrigationPlaceholder')} />

        <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={submit} disabled={saving || capturing}>
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
