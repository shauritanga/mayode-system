import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Add01Icon, Location01Icon, Layers01Icon, Edit02Icon, SquareLock02Icon, CheckmarkCircle02Icon, UserMultiple02Icon, Camera01Icon, File01Icon } from '@hugeicons/core-free-icons';
import { farmsApi, ownershipApi, assignmentsApi, seasonsApi, uploadsApi } from '../../src/lib/data';
import { boundaryPreviewHtml } from '../../src/lib/leaflet-preview-html';
import { useI18n } from '../../src/i18n';

interface Plot {
  id: string; plotCode: string; name?: string; sizeAcres?: number;
  centerLatitude?: number; centerLongitude?: number;
  _count?: { cropCycles: number };
}
interface Farm {
  id: string; farmCode: string; name?: string; village?: string;
  plotNumber?: string; blockNumber?: string; section?: string; ward?: string; district?: string; region?: string;
  socialHectares: number; actualAcres?: number; grade: string;
  isVerified: boolean; hasIrrigation: boolean; ownershipType?: string; ownerName?: string; ownerPhone?: string;
  soilType?: string; waterSource?: string; centerLatitude?: number;
  boundaryCoordinates?: any;
  farmer?: { firstName: string; lastName: string; controlNumber: string };
  plots?: Plot[];
}
interface Productivity {
  acres: number; plots: number; cropCycles: number; totalYieldKg?: number;
  yieldPerAcre?: number | null; costPerAcre?: number | null; netProfit?: number;
  locked?: boolean; code?: string; message?: string;
}
interface Ownership { id: string; confirmationStatus: string }
interface Assignment {
  id: string; assignmentType: string; status: string;
  farmingSeason?: { name: string };
  activeFarmer?: { firstName: string; lastName: string };
}

export default function FarmDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [prod, setProd] = useState<Productivity | null>(null);
  const [ownerships, setOwnerships] = useState<Ownership[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [photos, setPhotos] = useState<{ id: string; url: string; caption?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [f, p, o, a, ph] = await Promise.allSettled([
        farmsApi.getOne(id),
        farmsApi.productivity(id),
        ownershipApi.forFarm(id),
        assignmentsApi.forFarm(id),
        farmsApi.listPhotos(id),
      ]);
      if (f.status === 'fulfilled') setFarm(f.value.data);
      if (p.status === 'fulfilled') setProd(p.value.data);
      if (o.status === 'fulfilled') setOwnerships(o.value.data ?? []);
      if (a.status === 'fulfilled') setAssignments(a.value.data ?? []);
      if (ph.status === 'fulfilled') setPhotos(ph.value.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const addPhoto = useCallback(async () => {
    if (!id || uploadingPhoto) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('farmPhotos'), t('cameraPermissionNeeded'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const up = await uploadsApi.uploadFile({
        uri: asset.uri,
        name: asset.fileName || `farm-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      await farmsApi.addPhoto(id, { url: up.data.url });
      await load();
    } catch (e: any) {
      Alert.alert(t('farmPhotos'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setUploadingPhoto(false);
    }
  }, [id, uploadingPhoto, load, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading && !farm) {
    return (
      <SafeAreaView style={styles.center}><ActivityIndicator color="#10B981" size="large" /></SafeAreaView>
    );
  }
  if (!farm) {
    return <SafeAreaView style={styles.center}><Text>{t('farmNotFound')}</Text></SafeAreaView>;
  }

  const hasGPS = !!farm.centerLatitude;
  const plots = farm.plots || [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: farm.farmCode }} />
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
      >
        {/* Header card */}
        <View style={styles.card}>
          <Text style={styles.farmCode}>{farm.farmCode}</Text>
          {!!farm.name && <Text style={styles.name}>{farm.name}</Text>}
          {farm.farmer && (
            <Text style={styles.sub}>{farm.farmer.firstName} {farm.farmer.lastName} · {farm.farmer.controlNumber}</Text>
          )}
          <View style={styles.badgeRow}>
            <View style={[styles.badge, styles.badgeBlue]}><Text style={styles.badgeBlueText}>{t('gradeValue', { grade: farm.grade })}</Text></View>
            <View style={[styles.badge, farm.isVerified ? styles.badgeGreen : styles.badgeGold]}>
              <Text style={farm.isVerified ? styles.badgeGreenText : styles.badgeGoldText}>
                {farm.isVerified ? t('verified') : t('pending')}
              </Text>
            </View>
            <View style={[styles.badge, hasGPS ? styles.badgeGreen : styles.badgeGray]}>
              <Text style={hasGPS ? styles.badgeGreenText : styles.badgeGrayText}>{hasGPS ? t('mappedPin') : t('notMappedWarn')}</Text>
            </View>
          </View>
        </View>

        {/* Attributes */}
        <View style={styles.grid}>
          <Attr label={t('socialHectares')} value={`${farm.socialHectares} ha`} />
          <Attr label={t('actualAcres')} value={farm.actualAcres ? `${farm.actualAcres} ac` : '—'} />
          <Attr label={t('ownership')} value={farm.ownershipType || '—'} />
          <Attr label={t('plotNumber')} value={farm.plotNumber || '—'} />
          <Attr label={t('blockNumber')} value={farm.blockNumber || '—'} />
          <Attr label={t('sectionDirection')} value={farm.section || '—'} />
          <Attr label={t('ward')} value={farm.ward || '—'} />
          <Attr label={t('irrigation')} value={farm.hasIrrigation ? t('yes') : t('no')} />
          <Attr label={t('soilType')} value={farm.soilType || '—'} />
          <Attr label={t('waterSource')} value={farm.waterSource || '—'} />
          {farm.ownershipType === 'RENTED' && <Attr label={t('ownerName')} value={farm.ownerName || '—'} />}
        </View>

        {/* Ownership & seasonal use */}
        <OwnershipSeasonCard
          farmId={farm.id}
          farmCode={farm.farmCode}
          ownerships={ownerships}
          assignments={assignments}
          onChanged={load}
        />

        {/* Farm photos (owner comment §2.5: 3–5 photos) */}
        <View style={styles.card}>
          <View style={styles.plotsHeader}>
            <Text style={styles.sectionTitle}>{t('farmPhotos')} ({photos.length})</Text>
            <TouchableOpacity style={styles.addPlotBtn} onPress={addPhoto} disabled={uploadingPhoto}>
              {uploadingPhoto
                ? <ActivityIndicator size="small" color="#10B981" />
                : <><HugeiconsIcon icon={Camera01Icon} size={16} color="#10B981" strokeWidth={2} /><Text style={styles.addPlotText}>{t('addPhoto')}</Text></>}
            </TouchableOpacity>
          </View>
          {photos.length === 0 ? (
            <Text style={styles.photosHint}>{t('photosHint')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {photos.map((p) => (
                <Image key={p.id} source={{ uri: p.url }} style={styles.photoThumb} />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Printable analytics report (premium) */}
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => router.push({ pathname: '/farm-report/[id]', params: { id: farm.id } })}
        >
          <HugeiconsIcon icon={File01Icon} size={18} color="#fff" strokeWidth={2} />
          <Text style={styles.reportBtnText}>{t('viewFarmReport')}</Text>
        </TouchableOpacity>

        {/* Productivity — premium-gated by the backend */}
        {prod && (
          prod.locked ? (
            <View style={styles.lockedCard}>
              <View style={styles.lockedHeader}>
                <HugeiconsIcon icon={SquareLock02Icon} size={20} color="#B45309" strokeWidth={2} />
                <Text style={styles.lockedTitle}>{t('premiumLocked')}</Text>
              </View>
              {/* Safe preview: counts only, never the analytics values */}
              <View style={styles.grid}>
                <Attr label={t('cropCycles')} value={`${prod.cropCycles}`} />
                <Attr label={t('plots')} value={`${prod.plots}`} />
              </View>
              <Text style={styles.lockedMsg}>{prod.message || t('membershipCta')}</Text>
              <TouchableOpacity style={styles.unlockBtn} onPress={() => router.push('/membership')}>
                <Text style={styles.unlockBtnText}>{t('viewPlans')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>{t('productivity')}</Text>
              <View style={styles.grid}>
                <Attr label={t('cropCycles')} value={`${prod.cropCycles}`} />
                <Attr label={t('totalYield')} value={`${prod.totalYieldKg ?? 0} kg`} />
                <Attr label={t('yieldPerAcre')} value={prod.yieldPerAcre != null ? `${prod.yieldPerAcre} kg` : '—'} />
                <Attr label={t('netProfit')} value={`TZS ${(prod.netProfit ?? 0).toLocaleString()}`} />
              </View>
            </View>
          )
        )}

        {/* Boundary */}
        {hasGPS && farm.boundaryCoordinates ? (
          <View style={styles.boundaryCard}>
            <View style={styles.boundaryHeader}>
              <Text style={styles.sectionTitle}>{t('farmBoundary')}</Text>
              <TouchableOpacity
                style={styles.editBoundaryBtn}
                onPress={() => router.push({ pathname: '/boundary', params: { id: farm.id, label: t('farmContext', { code: farm.farmCode }) } })}
              >
                <HugeiconsIcon icon={Edit02Icon} size={14} color="#10B981" strokeWidth={2} />
                <Text style={styles.editBoundaryText}>{t('edit')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.miniMapWrap} pointerEvents="none">
              <WebView
                originWhitelist={['*']}
                source={{ html: boundaryPreviewHtml(farm.boundaryCoordinates) }}
                javaScriptEnabled
                scrollEnabled={false}
                style={styles.miniMap}
              />
            </View>
            <View style={styles.boundaryStats}>
              <View style={styles.mappedChip}>
                <HugeiconsIcon icon={Location01Icon} size={13} color="#10B981" strokeWidth={2} />
                <Text style={styles.mappedChipText}>{t('mapped')}</Text>
              </View>
              {!!farm.actualAcres && (
                <Text style={styles.boundaryArea}>
                  {farm.actualAcres} ac · {(farm.actualAcres / 2.47105).toFixed(2)} ha
                </Text>
              )}
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={() => router.push({ pathname: '/boundary', params: { id: farm.id, label: t('farmContext', { code: farm.farmCode }) } })}
          >
            <HugeiconsIcon icon={Location01Icon} size={18} color="#fff" strokeWidth={2} />
            <Text style={styles.gpsBtnText}>{t('walkFarmBoundary')}</Text>
          </TouchableOpacity>
        )}

        {/* Plots */}
        <View style={styles.plotsHeader}>
          <Text style={styles.sectionTitle}>{t('plots')} ({plots.length})</Text>
          <TouchableOpacity
            style={styles.addPlotBtn}
            onPress={() => router.push({ pathname: '/plot-new', params: { farmId: farm.id, farmCode: farm.farmCode } })}
          >
            <HugeiconsIcon icon={Add01Icon} size={16} color="#10B981" strokeWidth={2} />
            <Text style={styles.addPlotText}>{t('addPlot')}</Text>
          </TouchableOpacity>
        </View>

        {plots.length === 0 ? (
          <View style={styles.emptyPlots}>
            <HugeiconsIcon icon={Layers01Icon} size={40} color="#D1FAE5" strokeWidth={1.5} />
            <Text style={styles.emptyText}>{t('noPlotsYet')}</Text>
          </View>
        ) : (
          plots.map((p) => {
            const plotGps = !!p.centerLatitude;
            return (
              <View key={p.id} style={styles.plotCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.plotCode}>{p.plotCode}</Text>
                  <Text style={styles.plotSub}>
                    {p.name || t('unnamed')} · {p.sizeAcres ? `${p.sizeAcres} ac` : t('sizeUnknown')} · {p._count?.cropCycles ?? 0} {t('cycles')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.plotGpsBtn, plotGps && styles.plotGpsBtnDone]}
                  onPress={() => router.push({ pathname: '/boundary', params: { id: farm.id, plotId: p.id, label: t('plotContext', { code: p.plotCode }) } })}
                >
                  <HugeiconsIcon icon={Location01Icon} size={14} color={plotGps ? '#10B981' : '#3B82F6'} strokeWidth={2} />
                  <Text style={[styles.plotGpsText, plotGps && { color: '#10B981' }]}>{plotGps ? t('mapped') : t('map')}</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Attr({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.attr}>
      <Text style={styles.attrLabel}>{label}</Text>
      <Text style={styles.attrValue}>{value}</Text>
    </View>
  );
}

/**
 * Ownership confirmation + seasonal use (owner comments §7, §9, §13).
 * The legal owner confirms the farm belongs to them, then either declares
 * self-farming for the current season or adds a lease naming a renter.
 */
function OwnershipSeasonCard({
  farmId, farmCode, ownerships, assignments, onChanged,
}: {
  farmId: string; farmCode: string;
  ownerships: Ownership[]; assignments: Assignment[]; onChanged: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const confirmed = ownerships.some((o) => o.confirmationStatus === 'VERIFIED');
  const activeAssignment = assignments.find((a) => a.status === 'VERIFIED') || assignments[0];

  const confirmOwnership = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await ownershipApi.confirm(farmId);
      Alert.alert(t('ownershipAndSeason'), t('ownershipConfirmed'));
      onChanged();
    } catch (e: any) {
      Alert.alert(t('ownershipAndSeason'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const selfOperate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const season = await seasonsApi.current();
      if (!season.data?.id) {
        Alert.alert(t('ownershipAndSeason'), t('noCurrentSeason'));
        return;
      }
      await assignmentsApi.selfOperate({ farmId, farmingSeasonId: season.data.id });
      Alert.alert(t('ownershipAndSeason'), t('selfOperateDone'));
      onChanged();
    } catch (e: any) {
      Alert.alert(t('ownershipAndSeason'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  const assignmentLabel = (type: string) =>
    type === 'OWNER_OPERATED' ? t('ownerOperated') : type === 'RENTED' ? t('rented') : type;

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('ownershipAndSeason')}</Text>

      <View style={styles.ownRow}>
        <HugeiconsIcon
          icon={confirmed ? CheckmarkCircle02Icon : UserMultiple02Icon}
          size={18}
          color={confirmed ? '#10B981' : '#9CA3AF'}
          strokeWidth={2}
        />
        <Text style={styles.ownText}>
          {confirmed ? t('ownershipConfirmed') : t('ownershipConfirmPrompt')}
        </Text>
      </View>

      {activeAssignment && (
        <View style={styles.assignChip}>
          <Text style={styles.assignChipText}>
            {assignmentLabel(activeAssignment.assignmentType)}
            {activeAssignment.farmingSeason?.name ? ` · ${activeAssignment.farmingSeason.name}` : ''}
            {activeAssignment.activeFarmer
              ? ` · ${activeAssignment.activeFarmer.firstName} ${activeAssignment.activeFarmer.lastName}`
              : ''}
          </Text>
        </View>
      )}

      <View style={styles.ownActions}>
        {!confirmed && (
          <TouchableOpacity style={[styles.ownBtn, busy && { opacity: 0.6 }]} onPress={confirmOwnership} disabled={busy}>
            <Text style={styles.ownBtnText}>{t('confirmOwnership')}</Text>
          </TouchableOpacity>
        )}
        {confirmed && !activeAssignment && (
          <TouchableOpacity style={[styles.ownBtnOutline, busy && { opacity: 0.6 }]} onPress={selfOperate} disabled={busy}>
            <Text style={styles.ownBtnOutlineText}>{t('selfOperate')}</Text>
          </TouchableOpacity>
        )}
        {confirmed && (
          <TouchableOpacity
            style={styles.ownBtn}
            onPress={() => router.push({ pathname: '/lease-new', params: { farmId, farmCode } })}
          >
            <Text style={styles.ownBtnText}>{t('addLease')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  farmCode: { fontSize: 22, fontWeight: '900', color: '#10B981' },
  name: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2 },
  sub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10 },
  badgeBlue: { backgroundColor: 'rgba(59,130,246,0.15)' }, badgeBlueText: { color: '#3B82F6', fontSize: 11, fontWeight: '700' },
  badgeGreen: { backgroundColor: 'rgba(16,185,129,0.15)' }, badgeGreenText: { color: '#10B981', fontSize: 11, fontWeight: '700' },
  badgeGold: { backgroundColor: 'rgba(245,158,11,0.15)' }, badgeGoldText: { color: '#F59E0B', fontSize: 11, fontWeight: '700' },
  badgeGray: { backgroundColor: '#F3F4F6' }, badgeGrayText: { color: '#9CA3AF', fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attr: { width: '48%', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  attrLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  attrValue: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  gpsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#065F46', paddingVertical: 14, borderRadius: 14, marginBottom: 18,
  },
  gpsBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  boundaryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: '#E5E7EB' },
  boundaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  editBoundaryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16,185,129,0.12)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10 },
  editBoundaryText: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  miniMapWrap: { height: 190, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0b1f17' },
  miniMap: { flex: 1, backgroundColor: 'transparent' },
  boundaryStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  mappedChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(16,185,129,0.12)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10 },
  mappedChipText: { color: '#10B981', fontWeight: '700', fontSize: 12 },
  boundaryArea: { fontSize: 14, fontWeight: '700', color: '#111827' },
  plotsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  addPlotBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(16,185,129,0.12)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  addPlotText: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  emptyPlots: { alignItems: 'center', padding: 24, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  emptyText: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 10 },
  plotCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  plotCode: { fontSize: 15, fontWeight: '800', color: '#111827' },
  plotSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  plotGpsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(59,130,246,0.12)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  plotGpsBtnDone: { backgroundColor: 'rgba(16,185,129,0.12)' },
  plotGpsText: { color: '#3B82F6', fontWeight: '700', fontSize: 12 },
  // Locked premium analytics
  lockedCard: { backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
  lockedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  lockedTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  lockedMsg: { fontSize: 13, color: '#92400E', marginTop: 12, lineHeight: 19 },
  unlockBtn: { backgroundColor: '#F59E0B', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  unlockBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  // Ownership & seasonal use
  ownRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  ownText: { fontSize: 13, color: '#374151', flex: 1, lineHeight: 19 },
  assignChip: { backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 10 },
  assignChipText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  ownActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  ownBtn: { backgroundColor: '#10B981', paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12 },
  ownBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  ownBtnOutline: { borderWidth: 1.5, borderColor: '#10B981', paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12 },
  ownBtnOutlineText: { color: '#10B981', fontWeight: '800', fontSize: 13 },
  photosHint: { fontSize: 13, color: '#6B7280', marginTop: 6, lineHeight: 19 },
  photoThumb: { width: 96, height: 96, borderRadius: 12, marginRight: 10, backgroundColor: '#E5E7EB' },
  reportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#065F46', paddingVertical: 14, borderRadius: 14, marginBottom: 18,
  },
  reportBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
