import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert, Image, Modal, Pressable, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  Location01Icon, Layers01Icon, SquareLock02Icon,
  CheckmarkCircle02Icon, UserMultiple02Icon,
  EllipsisVerticalIcon,
} from '@hugeicons/core-free-icons';
import { farmsApi, ownershipApi, assignmentsApi, seasonsApi, uploadsApi, resolveMediaUrl } from '../../src/lib/data';
import { FarmBoundaryPreview } from '../../src/components/FarmBoundaryPreview';
import { isFarmBoundaryMapped } from '../../src/lib/farm-geo';
import { useI18n } from '../../src/i18n';
import { useAuthStore } from '../../src/store/auth.store';

const STAFF_ROLES = ['SUPER_ADMIN', 'ADMIN', 'FIELD_OFFICER', 'MAMCOS_SECRETARY'];
const FARM_MENU_TIP_KEY = 'mayode.farm.overflow.tip.seen';

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

type OverflowItem = { key: string; label: string; onPress: () => void; destructive?: boolean };

export default function FarmDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useI18n();
  const { user } = useAuthStore();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [prod, setProd] = useState<Productivity | null>(null);
  const [ownerships, setOwnerships] = useState<Ownership[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ownershipLoaded, setOwnershipLoaded] = useState(false);
  const [assignmentsLoaded, setAssignmentsLoaded] = useState(false);
  const [photos, setPhotos] = useState<{ id: string; url: string; caption?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [busyOwn, setBusyOwn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
      if (o.status === 'fulfilled') {
        setOwnerships(o.value.data ?? []);
        setOwnershipLoaded(true);
      } else {
        setOwnershipLoaded(false);
      }
      if (a.status === 'fulfilled') {
        setAssignments(a.value.data ?? []);
        setAssignmentsLoaded(true);
      } else {
        setAssignmentsLoaded(false);
      }
      if (ph.status === 'fulfilled') setPhotos(ph.value.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const uploadFarmPhotos = useCallback(async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (!id || !assets.length) return;
    setUploadingPhoto(true);
    try {
      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i];
        const payload = {
          uri: asset.uri,
          name: asset.fileName || `farm-${Date.now()}-${i}.jpg`,
          type: asset.mimeType || 'image/jpeg',
        };
        let up;
        try {
          up = await uploadsApi.uploadFile(payload);
        } catch {
          // One retry for flaky mobile networks before failing the batch.
          up = await uploadsApi.uploadFile(payload);
        }
        const url = resolveMediaUrl(up.data.url) || up.data.url;
        await farmsApi.addPhoto(id, { url });
      }
      await load();
    } catch (e: any) {
      Alert.alert(t('farmPhotos'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setUploadingPhoto(false);
    }
  }, [id, load, t]);

  const openOverflowMenu = useCallback(async () => {
    setMenuOpen(true);
    try {
      const seen = await AsyncStorage.getItem(FARM_MENU_TIP_KEY);
      if (!seen) {
        await AsyncStorage.setItem(FARM_MENU_TIP_KEY, '1');
        Alert.alert(t('moreOptions'), t('farmOverflowHint'));
      }
    } catch {
      /* tip is best-effort */
    }
  }, [t]);

  const addPhoto = useCallback(() => {
    if (!id || uploadingPhoto) return;
    Alert.alert(t('addPhoto'), t('photosHint'), [
      {
        text: t('takePhoto'),
        onPress: () => {
          void (async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(t('farmPhotos'), t('cameraPermissionNeeded'));
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.6,
              allowsEditing: false,
            });
            if (result.canceled || !result.assets?.length) return;
            await uploadFarmPhotos(result.assets);
          })();
        },
      },
      {
        text: t('chooseFromGallery'),
        onPress: () => {
          void (async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(t('farmPhotos'), t('allowPhotoAccess'));
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.6,
              allowsMultipleSelection: true,
              selectionLimit: 8,
            });
            if (result.canceled || !result.assets?.length) return;
            await uploadFarmPhotos(result.assets);
          })();
        },
      },
      { text: t('cancel'), style: 'cancel' },
    ]);
  }, [id, uploadingPhoto, t, uploadFarmPhotos]);

  const confirmOwnership = useCallback(async () => {
    if (!farm || busyOwn) return;
    setBusyOwn(true);
    try {
      await ownershipApi.confirm(farm.id);
      Alert.alert(t('ownershipAndSeason'), t('ownershipConfirmed'));
      await load();
    } catch (e: any) {
      Alert.alert(t('ownershipAndSeason'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusyOwn(false);
    }
  }, [farm, busyOwn, load, t]);

  const selfOperate = useCallback(async () => {
    if (!farm || busyOwn) return;
    setBusyOwn(true);
    try {
      const season = await seasonsApi.current();
      if (!season.data?.id) {
        Alert.alert(t('ownershipAndSeason'), t('noCurrentSeason'));
        return;
      }
      await assignmentsApi.selfOperate({ farmId: farm.id, farmingSeasonId: season.data.id });
      Alert.alert(t('ownershipAndSeason'), t('selfOperateDone'));
      await load();
    } catch (e: any) {
      Alert.alert(t('ownershipAndSeason'), e?.response?.data?.message || String(e?.message ?? e));
    } finally {
      setBusyOwn(false);
    }
  }, [farm, busyOwn, load, t]);

  const approveBoundary = useCallback(async () => {
    if (!farm) return;
    try {
      await farmsApi.reviewBoundary(farm.id);
      Alert.alert(t('boundaryApprovedTitle'), t('boundaryApprovedMessage'));
      await load();
    } catch (e: any) {
      Alert.alert(t('cannotApproveBoundary'), e?.response?.data?.message || e?.message || t('mapBoundaryFirst'));
    }
  }, [farm, load, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const confirmedOwnership = ownerships.some((o) => o.confirmationStatus === 'VERIFIED');
  const activeAssignment = assignments.find((a) => a.status === 'VERIFIED') || assignments[0];
  const hasGPS = farm ? isFarmBoundaryMapped(farm) : false;
  const isStaff = STAFF_ROLES.includes(user?.role ?? '');
  const isSecretary = user?.role === 'MAMCOS_SECRETARY';

  const overflowItems: OverflowItem[] = useMemo(() => {
    if (!farm) return [];
    const openBoundary = () =>
      router.push({ pathname: '/boundary', params: { id: farm.id, label: t('farmContext', { code: farm.farmCode }) } });

    const items: OverflowItem[] = [];

    // Only offer ownership/season mutations when those APIs loaded successfully.
    // A failed 403 must not look like "unconfirmed ownership".
    if (ownershipLoaded && !confirmedOwnership) {
      items.push({
        key: 'confirm-own',
        label: t('confirmOwnership'),
        onPress: () => { void confirmOwnership(); },
      });
    } else if (ownershipLoaded && assignmentsLoaded && confirmedOwnership && !activeAssignment) {
      items.push(
        {
          key: 'self-operate',
          label: t('selfOperate'),
          onPress: () => { void selfOperate(); },
        },
        {
          key: 'lease',
          label: t('addLease'),
          onPress: () => router.push({ pathname: '/lease-new', params: { farmId: farm.id, farmCode: farm.farmCode } }),
        },
      );
    }

    items.push({
      key: 'season-records',
      label: t('openSeasonRecords'),
      onPress: () => router.push({ pathname: '/crop-cycles/[farmId]', params: { farmId: farm.id, farmCode: farm.farmCode } }),
    });

    items.push({
      key: 'boundary',
      label: hasGPS ? t('editFarmBoundary') : t('walkFarmBoundary'),
      onPress: openBoundary,
    });

    items.push(
      {
        key: 'add-photo',
        label: uploadingPhoto ? t('uploadingPhotos') : t('addPhoto'),
        onPress: () => { if (!uploadingPhoto) addPhoto(); },
      },
      {
        key: 'add-plot',
        label: t('addPlot'),
        onPress: () => router.push({ pathname: '/plot-new', params: { farmId: farm.id, farmCode: farm.farmCode } }),
      },
      {
        key: 'correction',
        label: t('suggestCorrection'),
        onPress: () => router.push({ pathname: '/farm-correction', params: { farmId: farm.id, farmCode: farm.farmCode } }),
      },
      {
        key: 'report',
        label: t('viewFarmReport'),
        onPress: () => router.push({ pathname: '/farm-report/[id]', params: { id: farm.id } }),
      },
    );

    if (isStaff) {
      items.push({
        key: 'survey',
        label: t('recordFieldSurvey'),
        onPress: () => router.push({ pathname: '/field-survey', params: { farmId: farm.id, farmCode: farm.farmCode } }),
      });
    }
    if (isSecretary && !farm.isVerified) {
      items.push({
        key: 'approve-boundary',
        label: t('approveBoundary'),
        onPress: () => { void approveBoundary(); },
      });
    }
    if (isSecretary && farm.isVerified) {
      items.push({
        key: 'assign-renter',
        label: t('assignRenter'),
        onPress: () => router.push({ pathname: '/lease-new', params: { farmId: farm.id, farmCode: farm.farmCode } }),
      });
    }

    return items;
  }, [
    farm, t, router, confirmedOwnership, activeAssignment, hasGPS,
    confirmOwnership, selfOperate, addPhoto, uploadingPhoto,
    isStaff, isSecretary, approveBoundary, ownershipLoaded, assignmentsLoaded,
  ]);

  if (loading && !farm) {
    return (
      <SafeAreaView style={styles.center}><ActivityIndicator color="#10B981" size="large" /></SafeAreaView>
    );
  }
  if (!farm) {
    return <SafeAreaView style={styles.center}><Text>{t('farmNotFound')}</Text></SafeAreaView>;
  }

  const plots = farm.plots || [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: farm.farmCode,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => { void openOverflowMenu(); }}
              hitSlop={12}
              style={styles.headerMoreBtn}
              accessibilityRole="button"
              accessibilityLabel={t('moreOptions')}
            >
              <HugeiconsIcon icon={EllipsisVerticalIcon} size={22} color="#FFFFFF" strokeWidth={2} />
            </TouchableOpacity>
          ),
        }}
      />

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuWrap} onStartShouldSetResponder={() => true}>
            <View style={styles.menuSheet}>
              {overflowItems.map((item, index) => (
                <TouchableOpacity
                  key={item.key}
                  style={[styles.menuItem, index === overflowItems.length - 1 && styles.menuItemLast]}
                  onPress={() => {
                    setMenuOpen(false);
                    item.onPress();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.menuItemText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuOpen(false)} activeOpacity={0.7}>
              <Text style={styles.menuCancelText}>{t('cancel')}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#10B981" />}
      >
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

        <OwnershipSeasonCard
          ownerships={ownerships}
          assignments={assignments}
          ownershipLoaded={ownershipLoaded}
          assignmentsLoaded={assignmentsLoaded}
        />

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('farmPhotos')} ({photos.length})</Text>
          {uploadingPhoto && (
            <View style={styles.uploadRow}>
              <ActivityIndicator size="small" color="#10B981" />
              <Text style={styles.uploadText}>{t('uploadingPhotos')}</Text>
            </View>
          )}
          {photos.length === 0 ? (
            <Text style={styles.photosHint}>{t('photosHint')}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              {photos.map((p) => {
                const uri = resolveMediaUrl(p.url);
                if (!uri) return null;
                return <Image key={p.id} source={{ uri }} style={styles.photoThumb} />;
              })}
            </ScrollView>
          )}
        </View>

        {prod && (
          prod.locked ? (
            <View style={styles.lockedCard}>
              <View style={styles.lockedHeader}>
                <HugeiconsIcon icon={SquareLock02Icon} size={20} color="#B45309" strokeWidth={2} />
                <Text style={styles.lockedTitle}>{t('premiumLocked')}</Text>
              </View>
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

        {hasGPS ? (
          <View style={styles.boundaryCard}>
            <Text style={styles.sectionTitle}>{t('farmBoundary')}</Text>
            <View style={styles.miniMapWrap} pointerEvents="none">
              <FarmBoundaryPreview boundaryCoordinates={farm.boundaryCoordinates} height={190} style={styles.miniMapPreview} />
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
          <View style={styles.unmappedCard}>
            <HugeiconsIcon icon={Location01Icon} size={18} color="#9CA3AF" strokeWidth={2} />
            <Text style={styles.unmappedText}>{t('farmBoundaryUnmapped')}</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('plots')} ({plots.length})</Text>

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

/** Status-only ownership/season card — actions live in the header menu. */
function OwnershipSeasonCard({
  ownerships, assignments, ownershipLoaded, assignmentsLoaded,
}: {
  ownerships: Ownership[];
  assignments: Assignment[];
  ownershipLoaded: boolean;
  assignmentsLoaded: boolean;
}) {
  const { t } = useI18n();
  const confirmed = ownershipLoaded && ownerships.some((o) => o.confirmationStatus === 'VERIFIED');
  const activeAssignment = assignments.find((a) => a.status === 'VERIFIED') || assignments[0];

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
          {!ownershipLoaded
            ? t('ownershipStatusUnavailable')
            : confirmed
              ? t('ownershipConfirmed')
              : t('ownershipPending')}
        </Text>
      </View>
      {!assignmentsLoaded ? (
        <Text style={styles.seasonEmpty}>{t('seasonStatusUnavailable')}</Text>
      ) : activeAssignment ? (
        <View style={styles.assignChip}>
          <Text style={styles.assignChipText}>
            {assignmentLabel(activeAssignment.assignmentType)}
            {activeAssignment.farmingSeason?.name ? ` · ${activeAssignment.farmingSeason.name}` : ''}
            {activeAssignment.activeFarmer
              ? ` · ${activeAssignment.activeFarmer.firstName} ${activeAssignment.activeFarmer.lastName}`
              : ''}
          </Text>
        </View>
      ) : (
        <View>
          <Text style={styles.seasonEmpty}>{t('noSeasonAssignment')}</Text>
          {confirmed ? (
            <Text style={styles.seasonHint}>{t('seasonSetupHint')}</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  headerMoreBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.35)',
    justifyContent: 'flex-end',
  },
  menuWrap: {
    marginHorizontal: 12,
    marginBottom: Platform.OS === 'ios' ? 28 : 16,
    gap: 8,
  },
  menuSheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuItem: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'center' },
  menuCancel: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  menuCancelText: { fontSize: 16, fontWeight: '700', color: '#6B7280', textAlign: 'center' },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  attr: { width: '48%', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F3F4F6' },
  attrLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  attrValue: { fontSize: 15, fontWeight: '700', color: '#111827', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 10 },
  unmappedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  unmappedText: { flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 19 },
  boundaryCard: { backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: '#E5E7EB' },
  miniMapWrap: { height: 190, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0b1f17' },
  miniMapPreview: { height: 190, borderRadius: 12, borderWidth: 0 },
  boundaryStats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  mappedChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(16,185,129,0.12)', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10 },
  mappedChipText: { color: '#10B981', fontWeight: '700', fontSize: 12 },
  boundaryArea: { fontSize: 14, fontWeight: '700', color: '#111827' },
  emptyPlots: { alignItems: 'center', padding: 24, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  emptyText: { color: '#6B7280', fontSize: 13, textAlign: 'center', marginTop: 10 },
  plotCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  plotCode: { fontSize: 15, fontWeight: '800', color: '#111827' },
  plotSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  plotGpsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(59,130,246,0.12)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  plotGpsBtnDone: { backgroundColor: 'rgba(16,185,129,0.12)' },
  plotGpsText: { color: '#3B82F6', fontWeight: '700', fontSize: 12 },
  lockedCard: { backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A' },
  lockedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  lockedTitle: { fontSize: 15, fontWeight: '800', color: '#92400E' },
  lockedMsg: { fontSize: 13, color: '#92400E', marginTop: 12, lineHeight: 19 },
  unlockBtn: { backgroundColor: '#F59E0B', paddingVertical: 12, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  unlockBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  ownRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  ownText: { fontSize: 13, color: '#374151', flex: 1, lineHeight: 19 },
  assignChip: { backgroundColor: 'rgba(16,185,129,0.10)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 },
  assignChipText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  seasonEmpty: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  seasonHint: { fontSize: 12, color: '#047857', lineHeight: 18, marginTop: 6 },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  uploadText: { fontSize: 13, color: '#059669', fontWeight: '600' },
  photosHint: { fontSize: 13, color: '#6B7280', marginTop: 6, lineHeight: 19 },
  photoThumb: { width: 96, height: 96, borderRadius: 12, marginRight: 10, backgroundColor: '#E5E7EB' },
});
