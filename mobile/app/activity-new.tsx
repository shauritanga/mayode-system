import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Platform, Image, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Calendar01Icon, Camera01Icon, Location01Icon, CheckmarkCircle02Icon, Alert02Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { cropCyclesApi, farmsApi, uploadsApi } from '../src/lib/data';
import { checkWithinFarm, getCurrentPoint, FarmGeofenceResult } from '../src/services/location.service';
import { SearchableSelect } from '../src/components/SearchableSelect';
import { useI18n } from '../src/i18n';

interface FarmGeo {
  boundaryCoordinates?: { type: 'Polygon'; coordinates: number[][][] } | null;
  centerLatitude?: number | null;
  centerLongitude?: number | null;
}

interface ActivityPhoto {
  id: string;
  localUri: string;
  remoteUrl: string | null;
  uploading: boolean;
}

const ACTIVITY_TYPES = [
  { key: 'LAND_PREPARATION', labelKey: 'activityLandPreparation', icon: '🚜' },
  { key: 'PLANTING', labelKey: 'activityPlanting', icon: '🌱' },
  { key: 'FERTILIZING', labelKey: 'activityFertilizing', icon: '🧪' },
  { key: 'WEEDING', labelKey: 'activityWeeding', icon: '🌿' },
  { key: 'PEST_CONTROL', labelKey: 'activityPestControl', icon: '🐛' },
  { key: 'IRRIGATION', labelKey: 'activityIrrigation', icon: '💧' },
  { key: 'HARVESTING', labelKey: 'activityHarvesting', icon: '🌾' },
  { key: 'DRYING', labelKey: 'activityDrying', icon: '☀️' },
  { key: 'STORAGE', labelKey: 'activityStorage', icon: '📦' },
  { key: 'TRANSPORT', labelKey: 'activityTransport', icon: '🚚' },
] as const;

const MIN_PHOTOS = 2;

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Log a farming activity (owner comment: "record farm activities" — a free feature). */
export default function ActivityNew() {
  const { cropCycleId, farmId, farmCode, season } = useLocalSearchParams<{ cropCycleId: string; farmId?: string; farmCode?: string; season?: string }>();
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    if (!cropCycleId) {
      router.replace({ pathname: '/activity-select-cycle', params: { purpose: 'activity' } });
    }
  }, [cropCycleId, router]);

  const activityKeys = useMemo(() => ACTIVITY_TYPES.map((a) => a.key), []);
  const formatActivity = (key: string) => {
    const found = ACTIVITY_TYPES.find((a) => a.key === key);
    return found ? `${found.icon}  ${t(found.labelKey)}` : key;
  };

  const [activityType, setActivityType] = useState<string | null>(null);
  const [date, setDate] = useState(toDateInput(new Date()));
  const [showPicker, setShowPicker] = useState(false);
  const [description, setDescription] = useState('');
  const [laborWorkers, setLaborWorkers] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [photos, setPhotos] = useState<ActivityPhoto[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [gps, setGps] = useState<{ latitude: number; longitude: number } | null>(null);
  const [capturingGps, setCapturingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [farm, setFarm] = useState<FarmGeo | null>(null);
  const [farmLoading, setFarmLoading] = useState(!!farmId);
  const [geofence, setGeofence] = useState<FarmGeofenceResult | null>(null);

  useEffect(() => {
    if (!farmId) return;
    setFarmLoading(true);
    farmsApi.getOne(farmId).then((res) => setFarm(res.data)).catch(() => setFarm(null)).finally(() => setFarmLoading(false));
  }, [farmId]);

  const geofenceEnforced = !!farmId && !!farm && (!!farm.boundaryCoordinates || (farm.centerLatitude != null && farm.centerLongitude != null));
  const locationOk = farmLoading ? false : !geofenceEnforced || geofence?.status === 'inside';
  const readyPhotos = photos.filter((p) => p.remoteUrl && !p.uploading);
  const photosOk = readyPhotos.length >= MIN_PHOTOS && !photos.some((p) => p.uploading);

  const onPickDate = (event: any, selected?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (event.type === 'dismissed' || !selected) return;
    setDate(toDateInput(selected));
  };

  const uploadAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const draft: ActivityPhoto = { id, localUri: asset.uri, remoteUrl: null, uploading: true };
    setPhotos((prev) => [...prev, draft]);
    try {
      const up = await uploadsApi.uploadFile({
        uri: asset.uri,
        name: asset.fileName || `activity-${id}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      setPhotos((prev) =>
        prev.map((p) => (p.id === id ? { ...p, remoteUrl: up.data.url, uploading: false } : p)),
      );
    } catch (e: any) {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      const msg = e?.response?.data?.message;
      Alert.alert(t('logActivity'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('logActivity'), t('cameraPermissionNeeded'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return;
    await uploadAsset(result.assets[0]);
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('logActivity'), t('allowPhotoAccess'));
      return;
    }
    const remaining = Math.max(MIN_PHOTOS - photos.length, 1);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsMultipleSelection: true,
      selectionLimit: Math.min(remaining + 2, 6),
    });
    if (result.canceled || !result.assets?.length) return;
    for (const asset of result.assets) {
      await uploadAsset(asset);
    }
  };

  const addPhoto = () => {
    Alert.alert(t('addActivityPhoto'), t('activityPhotosHint'), [
      { text: t('takePhoto'), onPress: () => { void pickFromCamera(); } },
      { text: t('chooseFromGallery'), onPress: () => { void pickFromLibrary(); } },
      { text: t('cancel'), style: 'cancel' },
    ]);
  };

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const captureGps = async () => {
    setCapturingGps(true);
    try {
      const p = await getCurrentPoint();
      setGps(p);
      if (farm) setGeofence(checkWithinFarm(p, farm));
    } catch (e: any) {
      Alert.alert(t('captureLocation'), String(e?.message ?? e));
    } finally {
      setCapturingGps(false);
    }
  };

  const submit = async () => {
    if (!activityType || !date) {
      Alert.alert(t('logActivity'), t('fillActivityFields'));
      return;
    }
    if (!photosOk) {
      Alert.alert(t('logActivity'), t('photosRequiredMin'));
      return;
    }
    if (!locationOk) {
      Alert.alert(t('logActivity'), t('mustVerifyLocationFirst'));
      return;
    }
    setSubmitting(true);
    try {
      await cropCyclesApi.logActivity({
        cropCycleId: cropCycleId!,
        activityType,
        activityDate: date,
        description: description.trim() || undefined,
        laborWorkers: laborWorkers ? Number(laborWorkers) : undefined,
        laborHours: laborHours ? Number(laborHours) : undefined,
        photoUrls: readyPhotos.map((p) => p.remoteUrl!),
        gpsLatitude: gps?.latitude,
        gpsLongitude: gps?.longitude,
      });
      Alert.alert(t('logActivity'), t('activityLogged'), [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      Alert.alert(t('logActivity'), Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('logActivity') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        {(!!farmCode || !!season) && <Text style={styles.contextLabel}>{[farmCode, season].filter(Boolean).join(' · ')}</Text>}

        <View style={styles.card}>
          <SearchableSelect
            label={t('selectActivityType')}
            value={activityType}
            placeholder={t('selectActivityType')}
            options={activityKeys}
            onSelect={setActivityType}
            searchable
            formatLabel={formatActivity}
          />

          <Text style={styles.fieldLabel}>{t('activityDate')}</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
            <HugeiconsIcon icon={Calendar01Icon} size={16} color="#10B981" strokeWidth={2} />
            <Text style={styles.dateBtnText}>{date}</Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={new Date(date)}
              mode="date"
              maximumDate={new Date()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onPickDate}
            />
          )}

          <Text style={styles.fieldLabel}>{t('activityDescription')}</Text>
          <TextInput style={[styles.input, styles.inputMultiline]} value={description} onChangeText={setDescription} multiline placeholderTextColor="#9CA3AF" />

          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('laborWorkers')}</Text>
              <TextInput style={styles.input} value={laborWorkers} onChangeText={setLaborWorkers} keyboardType="number-pad" placeholderTextColor="#9CA3AF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('laborHours')}</Text>
              <TextInput style={styles.input} value={laborHours} onChangeText={setLaborHours} keyboardType="decimal-pad" placeholderTextColor="#9CA3AF" />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 4 }]}>
            {t('addActivityPhoto')}
            <Text style={styles.requiredMark}> *</Text>
          </Text>
          <Text style={styles.photosHint}>{t('activityPhotosHint')}</Text>
          <View style={styles.photoGrid}>
            {photos.map((photo) => (
              <View key={photo.id} style={styles.photoCell}>
                <View style={styles.photoTile}>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewUri(photo.localUri)} style={StyleSheet.absoluteFill}>
                    <Image source={{ uri: photo.localUri }} style={styles.photoImage} resizeMode="cover" />
                  </TouchableOpacity>
                  {photo.uploading && (
                    <View style={styles.photoOverlay}>
                      <ActivityIndicator color="#fff" />
                    </View>
                  )}
                  {!photo.uploading && (
                    <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(photo.id)} hitSlop={8}>
                      <HugeiconsIcon icon={Cancel01Icon} size={14} color="#fff" strokeWidth={2.5} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            <View style={styles.photoCell}>
              <TouchableOpacity
                style={styles.addPhotoTile}
                onPress={addPhoto}
                activeOpacity={0.85}
              >
                <HugeiconsIcon icon={Camera01Icon} size={28} color="#10B981" strokeWidth={1.8} />
                <Text style={styles.addPhotoText}>{t('addPhoto')}</Text>
                <Text style={styles.addPhotoCount}>
                  {readyPhotos.length}/{MIN_PHOTOS}+
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {photos.length > 0 && photos.length < MIN_PHOTOS && (
            <Text style={styles.photosWarn}>{t('photosRequiredMin')}</Text>
          )}

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>{t('captureLocation')}</Text>
          <TouchableOpacity
            style={[
              styles.secondaryBtn,
              geofence?.status === 'inside' && styles.locationBtnOk,
              geofence?.status === 'outside' && styles.locationBtnBad,
            ]}
            onPress={captureGps}
            disabled={capturingGps || farmLoading}
          >
            {capturingGps || farmLoading ? (
              <>
                <ActivityIndicator size="small" color="#10B981" />
                <Text style={styles.secondaryBtnText}>{t('verifyingLocation')}</Text>
              </>
            ) : (
              <>
                <HugeiconsIcon
                  icon={geofence?.status === 'outside' ? Alert02Icon : gps ? CheckmarkCircle02Icon : Location01Icon}
                  size={16}
                  color={geofence?.status === 'outside' ? '#DC2626' : '#10B981'}
                  strokeWidth={2}
                />
                <Text style={[styles.secondaryBtnText, geofence?.status === 'outside' && { color: '#DC2626' }]}>
                  {gps ? `${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)}` : t('captureLocation')}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {geofenceEnforced && geofence?.status === 'inside' && (
            <Text style={styles.locationOk}>{t('withinFarmBoundary')}</Text>
          )}
          {geofenceEnforced && geofence?.status === 'outside' && (
            <>
              <Text style={styles.locationBad}>
                {geofence.distanceM != null
                  ? t('outsideFarmBoundaryDistance', { distance: Math.round(geofence.distanceM) })
                  : t('outsideFarmBoundary')}
              </Text>
              <TouchableOpacity onPress={captureGps} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>{t('retryLocation')}</Text>
              </TouchableOpacity>
            </>
          )}
          {!!farmId && !farmLoading && farm && !geofenceEnforced && (
            <Text style={styles.locationHint}>{t('farmBoundaryUnmapped')}</Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (submitting || !locationOk || !photosOk || !activityType) && { opacity: 0.6 }]}
          onPress={submit}
          disabled={submitting || !locationOk || !photosOk || !activityType}
        >
          <Text style={styles.submitText}>{t('logActivity')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!previewUri} transparent animationType="fade" onRequestClose={() => setPreviewUri(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUri(null)}>
          <SafeAreaView style={styles.previewSafe} edges={['top', 'bottom']}>
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreviewUri(null)} hitSlop={12}>
              <HugeiconsIcon icon={Cancel01Icon} size={22} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
            <View style={styles.previewHintRow}>
              <HugeiconsIcon icon={Camera01Icon} size={14} color="rgba(255,255,255,0.7)" strokeWidth={2} />
              <Text style={styles.previewHint}>{t('tapToClosePreview')}</Text>
            </View>
          </SafeAreaView>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  contextLabel: { fontSize: 13, color: '#6B7280', marginBottom: 12, fontWeight: '600' },
  locationBtnOk: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
  locationBtnBad: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  locationOk: { fontSize: 12, color: '#10B981', fontWeight: '700', marginTop: 8 },
  locationBad: { fontSize: 12, color: '#DC2626', fontWeight: '600', marginTop: 8, lineHeight: 17 },
  locationHint: { fontSize: 12, color: '#9CA3AF', marginTop: 8, lineHeight: 17 },
  retryBtn: { alignSelf: 'flex-start', marginTop: 8 },
  retryBtnText: { fontSize: 13, color: '#10B981', fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  requiredMark: { color: '#DC2626', fontWeight: '800' },
  photosHint: { fontSize: 12, color: '#6B7280', marginBottom: 12, lineHeight: 17, marginTop: -4 },
  photosWarn: { fontSize: 12, color: '#DC2626', fontWeight: '600', marginTop: 8 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 12 },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  dateBtnText: { fontSize: 14, color: '#111827' },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 13, color: '#111827' },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  photoCell: {
    width: '48%',
    aspectRatio: 1,
  },
  photoTile: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  photoImage: { width: '100%', height: '100%' },
  photoOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(17,24,39,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(17,24,39,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderStyle: 'dashed',
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
  },
  addPhotoText: { fontSize: 13, fontWeight: '700', color: '#065F46' },
  addPhotoCount: { fontSize: 11, color: '#059669', fontWeight: '600' },
  submitBtn: { backgroundColor: '#065F46', paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  previewSafe: { flex: 1, justifyContent: 'center' },
  previewClose: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: { width: '100%', height: '80%' },
  previewHintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12 },
  previewHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
});
