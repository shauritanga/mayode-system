import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Location01Icon, CheckmarkCircle02Icon, Camera01Icon, Cancel01Icon, Calendar01Icon } from '@hugeicons/core-free-icons';
import { cropCyclesApi, farmsApi, officerVisitsApi, uploadsApi, resolveMediaUrl } from '../../src/lib/data';
import { getCurrentPoint } from '../../src/services/location.service';
import { useI18n } from '../../src/i18n';
import { SearchableSelect } from '../../src/components/SearchableSelect';
import {
  CONDITION_LABEL_KEYS,
  FIELD_CONDITION_STATUSES,
  FieldConditionStatus,
  RICE_GROWTH_STAGES,
  RiceGrowthStage,
  growthStageLabel,
} from '../../src/lib/field-visit';

interface FarmOption {
  id: string;
  farmCode: string;
  name?: string;
}

interface Draft {
  visitDate: string;
  growthStage: RiceGrowthStage | null;
  riceVariety: string;
  cropCondition: FieldConditionStatus | null;
  waterStatus: FieldConditionStatus | null;
  weedStatus: FieldConditionStatus | null;
  pestStatus: FieldConditionStatus | null;
  diseaseStatus: FieldConditionStatus | null;
  fertilizerApplied: boolean | null;
  inputUsed: string;
  inputQuantity: string;
  observations: string;
  recommendations: string;
  nextVisitDate: string;
  latitude: number | null;
  longitude: number | null;
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

const EMPTY_DRAFT = (): Draft => ({
  visitDate: toDateInput(new Date()),
  growthStage: null,
  riceVariety: '',
  cropCondition: null,
  waterStatus: null,
  weedStatus: null,
  pestStatus: null,
  diseaseStatus: null,
  fertilizerApplied: null,
  inputUsed: '',
  inputQuantity: '',
  observations: '',
  recommendations: '',
  nextVisitDate: '',
  latitude: null,
  longitude: null,
});

function StatusChips({
  label,
  value,
  onChange,
  t,
}: {
  label: string;
  value: FieldConditionStatus | null;
  onChange: (v: FieldConditionStatus) => void;
  t: (key: string) => string;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {FIELD_CONDITION_STATUSES.map((status) => {
          const on = value === status;
          return (
            <TouchableOpacity
              key={status}
              style={[styles.chip, on && styles.chipActive]}
              onPress={() => onChange(status)}
            >
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{t(CONDITION_LABEL_KEYS[status])}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function OfficerVisitNewScreen() {
  const { farmerId: farmerIdParam, farmerName, farmId: farmIdParam, cropCycleId: cropCycleIdParam } = useLocalSearchParams<{
    farmerId?: string; farmerName?: string; farmId?: string; cropCycleId?: string;
  }>();
  const router = useRouter();
  const { t } = useI18n();
  const draftKey = `mayode-field-visit-draft-${farmerIdParam ?? 'new'}`;

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT());
  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState<string | null>(farmIdParam ?? null);
  const [cropCycleId, setCropCycleId] = useState<string | undefined>(cropCycleIdParam);
  const [loadingFarms, setLoadingFarms] = useState(!!farmerIdParam);
  const [capturingGps, setCapturingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showVisitPicker, setShowVisitPicker] = useState(false);
  const [showNextPicker, setShowNextPicker] = useState(false);

  const labelT = (key: string) => t(key as Parameters<typeof t>[0]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey);
        if (raw) {
          const saved = JSON.parse(raw);
          setDraft((d) => ({ ...d, ...saved }));
          if (saved.selectedFarmId) setSelectedFarmId(saved.selectedFarmId);
        }
      } catch {}
    })();
  }, [draftKey]);

  const loadFarms = useCallback(async () => {
    if (!farmerIdParam) return;
    setLoadingFarms(true);
    try {
      const res = await farmsApi.getByFarmerId(farmerIdParam);
      const list = res.data?.data ?? res.data ?? [];
      const items = Array.isArray(list) ? list : [];
      setFarms(items);
      if (!selectedFarmId && items.length === 1) {
        setSelectedFarmId(items[0].id);
      }
    } catch {
      setFarms([]);
    } finally {
      setLoadingFarms(false);
    }
  }, [farmerIdParam, selectedFarmId]);

  useEffect(() => {
    loadFarms();
  }, [loadFarms]);

  useEffect(() => {
    if (!selectedFarmId) return;
    let active = true;
    (async () => {
      try {
        const res = await cropCyclesApi.getByFarmId(selectedFarmId);
        const cycles = res.data?.data ?? res.data ?? [];
        const list = Array.isArray(cycles) ? cycles : [];
        const activeCycle = list.find((c: any) => c.status === 'ACTIVE' || c.status === 'PLANNED') ?? list[0];
        if (!active) return;
        if (activeCycle?.id) setCropCycleId(activeCycle.id);
        if (activeCycle?.riceVariety && !draft.riceVariety) {
          set('riceVariety', activeCycle.riceVariety);
        }
      } catch {
        /* optional prefill */
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedFarmId]);

  const farmOptions = useMemo(() => farms.map((f) => f.id), [farms]);
  const farmLabel = useCallback((id: string) => {
    const f = farms.find((x) => x.id === id);
    return f ? `${f.farmCode}${f.name ? ` — ${f.name}` : ''}` : id;
  }, [farms]);

  const saveDraft = async () => {
    await AsyncStorage.setItem(draftKey, JSON.stringify({ ...draft, selectedFarmId }));
    Alert.alert(t('fieldVisitTitle'), t('draftSaved'));
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
    if (!farmerIdParam || !selectedFarmId || !draft.growthStage || !draft.cropCondition) {
      Alert.alert(t('fieldVisitTitle'), t('fieldVisitRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const visitedAt = new Date(`${draft.visitDate}T12:00:00`).toISOString();
      const nextVisitDate = draft.nextVisitDate
        ? new Date(`${draft.nextVisitDate}T09:00:00`).toISOString()
        : undefined;
      await officerVisitsApi.create({
        farmerId: farmerIdParam,
        farmId: selectedFarmId,
        cropCycleId,
        purpose: 'ROUTINE_CHECK',
        visitedAt,
        growthStage: draft.growthStage,
        riceVariety: draft.riceVariety.trim() || undefined,
        cropCondition: draft.cropCondition,
        waterStatus: draft.waterStatus ?? undefined,
        weedStatus: draft.weedStatus ?? undefined,
        pestStatus: draft.pestStatus ?? undefined,
        diseaseStatus: draft.diseaseStatus ?? undefined,
        fertilizerApplied: draft.fertilizerApplied ?? undefined,
        inputUsed: draft.inputUsed.trim() || undefined,
        inputQuantity: draft.inputQuantity.trim() || undefined,
        observations: draft.observations.trim() || undefined,
        recommendations: draft.recommendations.trim() || undefined,
        nextVisitDate,
        photoUrls,
        gpsLatitude: draft.latitude ?? undefined,
        gpsLongitude: draft.longitude ?? undefined,
      });
      await AsyncStorage.removeItem(draftKey);
      Alert.alert(t('fieldVisitTitle'), t('visitSubmitted'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('fieldVisitTitle'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!farmerIdParam) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <Stack.Screen options={{ headerShown: true, title: t('fieldVisitTitle') }} />
        <View style={styles.center}>
          <Text style={styles.hint}>{t('selectFarmer')}</Text>
          <TouchableOpacity style={styles.submitBtn} onPress={() => router.push('/officer-farmers')}>
            <Text style={styles.submitText}>{t('myFarmers')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('fieldVisitTitle') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {!!farmerName && <Text style={styles.heroLabel}>{farmerName}</Text>}

        <View style={styles.card}>
          {loadingFarms ? (
            <ActivityIndicator color="#10B981" />
          ) : (
            <SearchableSelect
              label={`${t('farm')} *`}
              value={selectedFarmId}
              options={farmOptions}
              formatLabel={farmLabel}
              placeholder={t('selectFarm')}
              onSelect={setSelectedFarmId}
            />
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{`${t('visitDate')} *`}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowVisitPicker(true)}>
            <HugeiconsIcon icon={Calendar01Icon} size={18} color="#065F46" strokeWidth={2} />
            <Text style={styles.dateBtnText}>{draft.visitDate}</Text>
          </TouchableOpacity>
          {showVisitPicker && (
            <DateTimePicker
              value={new Date(`${draft.visitDate}T12:00:00`)}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_, date) => {
                setShowVisitPicker(Platform.OS === 'ios');
                if (date) set('visitDate', toDateInput(date));
              }}
            />
          )}
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
          <SearchableSelect
            label={`${t('growthStage')} *`}
            value={draft.growthStage}
            options={[...RICE_GROWTH_STAGES]}
            formatLabel={(v) => growthStageLabel(v as RiceGrowthStage, labelT)}
            placeholder={t('select')}
            onSelect={(v) => set('growthStage', v as RiceGrowthStage)}
          />
          <View style={{ marginTop: 12 }}>
            <Text style={styles.fieldLabel}>{t('riceVariety')}</Text>
            <TextInput
              style={styles.input}
              value={draft.riceVariety}
              onChangeText={(v) => set('riceVariety', v)}
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        <View style={styles.card}>
          <StatusChips label={`${t('cropCondition')} *`} value={draft.cropCondition} onChange={(v) => set('cropCondition', v)} t={labelT} />
          <StatusChips label={t('waterStatus')} value={draft.waterStatus} onChange={(v) => set('waterStatus', v)} t={labelT} />
          <StatusChips label={t('weedStatus')} value={draft.weedStatus} onChange={(v) => set('weedStatus', v)} t={labelT} />
          <StatusChips label={t('pestStatus')} value={draft.pestStatus} onChange={(v) => set('pestStatus', v)} t={labelT} />
          <StatusChips label={t('diseaseStatus')} value={draft.diseaseStatus} onChange={(v) => set('diseaseStatus', v)} t={labelT} />
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('fertilizerApplied')}</Text>
          <View style={styles.chipRow}>
            {([true, false] as const).map((val) => {
              const on = draft.fertilizerApplied === val;
              return (
                <TouchableOpacity key={String(val)} style={[styles.chip, on && styles.chipActive]} onPress={() => set('fertilizerApplied', val)}>
                  <Text style={[styles.chipText, on && styles.chipTextActive]}>{val ? t('yes') : t('no')}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('inputUsed')}</Text>
          <TextInput style={styles.input} value={draft.inputUsed} onChangeText={(v) => set('inputUsed', v)} placeholderTextColor="#9CA3AF" />
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('inputQuantity')}</Text>
          <TextInput style={styles.input} value={draft.inputQuantity} onChangeText={(v) => set('inputQuantity', v)} placeholder="e.g. 50 kg" placeholderTextColor="#9CA3AF" />
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('observationsLabel')}</Text>
          <TextInput style={[styles.input, styles.inputMultiline]} multiline value={draft.observations} onChangeText={(v) => set('observations', v)} placeholderTextColor="#9CA3AF" />
          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('recommendationsLabel')}</Text>
          <TextInput style={[styles.input, styles.inputMultiline]} multiline value={draft.recommendations} onChangeText={(v) => set('recommendations', v)} placeholderTextColor="#9CA3AF" />
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('surveyPhotos')}</Text>
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

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>{t('nextVisitDate')}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowNextPicker(true)}>
            <HugeiconsIcon icon={Calendar01Icon} size={18} color="#065F46" strokeWidth={2} />
            <Text style={styles.dateBtnText}>{draft.nextVisitDate || t('select')}</Text>
          </TouchableOpacity>
          {showNextPicker && (
            <DateTimePicker
              value={draft.nextVisitDate ? new Date(`${draft.nextVisitDate}T12:00:00`) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_, date) => {
                setShowNextPicker(Platform.OS === 'ios');
                if (date) set('nextVisitDate', toDateInput(date));
              }}
            />
          )}
        </View>

        <TouchableOpacity style={styles.draftBtn} onPress={saveDraft}>
          <Text style={styles.draftBtnText}>{t('saveDraft')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.submitBtn, submitting && { opacity: 0.6 }]} onPress={submit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('fieldVisitTitle')}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  hint: { fontSize: 14, color: '#6B7280', marginBottom: 16, textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  heroLabel: { fontSize: 18, fontWeight: '900', color: '#10B981', marginBottom: 10 },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  dateBtnText: { fontSize: 15, fontWeight: '600', color: '#111827' },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', paddingVertical: 13, borderRadius: 12 },
  gpsBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#065F46', borderColor: '#065F46' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { width: 64, height: 64 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbRemove: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center' },
  addThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  draftBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#065F46', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  draftBtnText: { color: '#065F46', fontWeight: '800', fontSize: 15 },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center', marginBottom: 24 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
