import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  Location01Icon,
  ArrowRight01Icon,
  BellIcon,
  Alert02Icon,
  SquareLock02Icon,
  Plant01Icon,
  TaskDaily01Icon,
  Wallet01Icon,
  CoinsDollarIcon,
} from '@hugeicons/core-free-icons';
import { useAuthStore } from '../../../src/store/auth.store';
import { farmsApi, activitiesApi, alertsApi, registryApi } from '../../../src/lib/data';
import { fetchWeatherHere, WeatherData } from '../../../src/services/weather.service';
import { useI18n } from '../../../src/i18n';
import ActivityFeedCard from '../../../src/components/ActivityFeedCard';
import { DrawerMenuButton } from '../../../src/components/DrawerMenuButton';
import { isFarmBoundaryMapped } from '../../../src/lib/farm-geo';
import RoleWorkspaceDashboard from '../../role-workspace';

export default function DashboardTab() {
  const { user } = useAuthStore();
  if (user?.role && user.role !== 'FARMER') {
    return <RoleWorkspaceDashboard role={user.role} />;
  }
  return <FarmerDashboardTab />;
}

function FarmerDashboardTab() {
  const { user, farmerId } = useAuthStore();
  const { language, t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardW = width - 40; // full content width (body padding 20 each side)
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [claimable, setClaimable] = useState<any[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [farmsRes, actsRes, alertsRes, claimRes] = await Promise.allSettled([
        farmerId ? farmsApi.getByFarmerId(farmerId) : farmsApi.getAll(),
        farmerId ? activitiesApi.recentForFarmer(farmerId, 5) : Promise.resolve({ data: [] as any[] }),
        alertsApi.list(),
        registryApi.mine(),
      ]);
      const farmsData = farmsRes.status === 'fulfilled' ? (farmsRes.value.data?.data ?? farmsRes.value.data) : [];
      const actsData = actsRes.status === 'fulfilled' ? actsRes.value.data : [];
      const alertsData = alertsRes.status === 'fulfilled' ? alertsRes.value.data : [];
      const claimData = claimRes.status === 'fulfilled' ? claimRes.value.data : [];
      setFarms(Array.isArray(farmsData) ? farmsData : []);
      setActivities(Array.isArray(actsData) ? actsData : []);
      // Only open alerts on the dashboard summary.
      setAlerts(Array.isArray(alertsData) ? alertsData.filter((a: any) => a.status === 'OPEN') : []);
      setClaimable(Array.isArray(claimData) ? claimData.filter((r: any) => r.status === 'OWNER_CONFIRMATION_PENDING') : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadWeather = async () => {
    setWeatherLoading(true);
    try {
      setWeather(await fetchWeatherHere());
    } catch {
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    loadWeather();
  }, [farmerId]);

  const name = user?.firstName ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}` : t('farmerFallback');
  const when = weather?.observedAt || new Date();
  const dateStr = when.toLocaleDateString(language === 'sw' ? 'sw-TZ' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = when.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => { fetchData(); loadWeather(); }}
            tintColor="#fff"
          />
        }
      >
        {/* ── Green weather hero ── */}
        <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
          {/* Greeting */}
          <View style={styles.greetRow}>
            <DrawerMenuButton light />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.hi}>{t('hiName', { name })}</Text>
              <Text style={styles.welcome}>{t('welcomeBack')}</Text>
            </View>
            <TouchableOpacity
              style={styles.bell}
              onPress={() => router.push('/notifications')}
            >
              <HugeiconsIcon icon={BellIcon} size={22} color="#fff" strokeWidth={1.8} />
            </TouchableOpacity>
          </View>

          {/* Weather card */}
          <View style={styles.weatherCard}>
            <View style={styles.weatherTop}>
              <View style={styles.locRow}>
                <HugeiconsIcon icon={Location01Icon} size={18} color="rgba(255,255,255,0.85)" strokeWidth={2} />
                <Text style={styles.city} numberOfLines={1}>
                  {weather?.city || (weatherLoading ? t('locating') : t('weatherUnavailable'))}
                </Text>
              </View>
              <Text style={styles.weatherEmoji}>{weather?.icon || '⛅'}</Text>
            </View>

            <View style={styles.weatherMid}>
              <Text style={styles.temp}>
                {weather ? weather.tempC : '—'}<Text style={styles.tempUnit}>°C</Text>
              </Text>
              <View style={{ alignItems: 'flex-end', flex: 1 }}>
                <Text style={styles.condition} numberOfLines={1}>{weather?.condition ? t(weather.condition) : ''}</Text>
                <Text style={styles.datetime}>{dateStr} | {timeStr}</Text>
                <Text style={styles.weatherProvider}>{weather ? t('liveWeatherProvider', { provider: weather.provider }) : ''}</Text>
              </View>
            </View>

            <View style={styles.weatherDivider} />

            <View style={styles.weatherStats}>
              <WStat label={t('humidity')} value={weather ? `${weather.humidity}%` : '—'} />
              <WStat label={t('precipitation')} value={weather ? `${weather.precipitationMm} mm` : '—'} />
              <WStat label={t('windSpeed')} value={weather ? `${weather.windKmh} km/h` : '—'} />
            </View>
          </View>
        </View>

        {/* ── Body ── */}
        <View style={styles.body}>
          {/* AMCOS pre-registered farms awaiting the owner's confirmation */}
          {claimable.length > 0 && (
            <TouchableOpacity style={styles.claimBanner} onPress={() => router.push('/claim-farms')}>
              <View style={styles.claimIcon}>
                <HugeiconsIcon icon={Plant01Icon} size={20} color="#065F46" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.claimTitle}>{t('confirmYourFarms')}</Text>
                <Text style={styles.claimSub} numberOfLines={1}>{t('registryIntro')}</Text>
              </View>
              <HugeiconsIcon icon={ArrowRight01Icon} size={18} color="#065F46" strokeWidth={2} />
            </TouchableOpacity>
          )}

          {/* Farm alerts summary — teaser that drives membership conversion */}
          {alerts.length > 0 && (
            <View style={{ marginBottom: 22 }}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>{t('farmAlerts')}</Text>
                <TouchableOpacity style={styles.viewAll} onPress={() => router.push('/alerts')}>
                  <Text style={styles.viewAllText}>{t('viewAllAlerts')}</Text>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="#10B981" strokeWidth={2} />
                </TouchableOpacity>
              </View>
              {alerts.slice(0, 2).map((a: any) => (
                <TouchableOpacity
                  key={a.id}
                  style={styles.alertCard}
                  onPress={() => router.push({ pathname: '/alert/[id]', params: { id: a.id } })}
                >
                  <View style={styles.alertIconWrap}>
                    <HugeiconsIcon icon={Alert02Icon} size={20} color="#F59E0B" strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertTitle} numberOfLines={1}>{a.title}</Text>
                    <Text style={styles.alertPreview} numberOfLines={1}>{a.previewMessage}</Text>
                  </View>
                  {a.locked && <HugeiconsIcon icon={SquareLock02Icon} size={16} color="#B45309" strokeWidth={2} />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Season shortcuts — ≤3 taps to activity / expense / sale */}
          {farms.length > 0 && (
            <View style={{ marginBottom: 22 }}>
              <Text style={styles.sectionTitle}>{t('seasonRecords')}</Text>
              <Text style={styles.quickHint}>{t('seasonHomeHint')}</Text>
              <View style={styles.quickRow}>
                <QuickAction
                  label={t('logActivity')}
                  icon={TaskDaily01Icon}
                  onPress={() => router.push({ pathname: '/activity-select-cycle', params: { purpose: 'activity' } })}
                />
                <QuickAction
                  label={t('addExpense')}
                  icon={Wallet01Icon}
                  onPress={() => router.push({ pathname: '/activity-select-cycle', params: { purpose: 'expense' } })}
                />
                <QuickAction
                  label={t('recordSale')}
                  icon={CoinsDollarIcon}
                  onPress={() => router.push({ pathname: '/activity-select-cycle', params: { purpose: 'sale' } })}
                />
              </View>
              {farms.length === 1 ? (
                <TouchableOpacity
                  style={styles.seasonLink}
                  onPress={() => router.push({
                    pathname: '/crop-cycles/[farmId]',
                    params: { farmId: farms[0].id, farmCode: farms[0].farmCode },
                  })}
                >
                  <Text style={styles.seasonLinkText}>{t('openSeasonRecords')}</Text>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="#065F46" strokeWidth={2} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.seasonLink} onPress={() => router.push('/farms')}>
                  <Text style={styles.seasonLinkText}>{t('pickFarmForSeason')}</Text>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="#065F46" strokeWidth={2} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* My Farms */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t('myFarms')}</Text>
            {farms.length > 0 && (
              <TouchableOpacity style={styles.viewAll} onPress={() => router.push('/farms')}>
                <Text style={styles.viewAllText}>{t('viewAll')}</Text>
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="#10B981" strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>

          {loading ? (
            <View style={[styles.emptyFarmCard, { width: cardW }]}>
              <Text style={styles.emptyFarmDesc}>{t('loadingFarms')}</Text>
            </View>
          ) : farms.length === 0 ? (
            <View style={[styles.emptyFarmCard, { width: cardW }]}>
              <Text style={styles.emptyFarmTitle}>{t('noFarmsYet')}</Text>
              <Text style={styles.emptyFarmDesc}>
                Your AMCOS will assign a farm for the active season. Once you accept, it will be verified by the field officer and it will be displayed here
              </Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardW + 12}
              decelerationRate="fast"
              snapToAlignment="start"
            >
              {farms.map((farm) => (
                <FarmCard
                  key={farm.id}
                  farm={farm}
                  width={cardW}
                  t={t}
                  onPress={() => router.push({ pathname: '/farm/[id]', params: { id: farm.id } })}
                />
              ))}
            </ScrollView>
          )}

          {/* Recent Activities */}
          <View style={[styles.sectionHeaderRow, { marginTop: 26 }]}>
            <Text style={styles.sectionTitle}>{t('recentActivities')}</Text>
            {activities.length > 0 && (
              <TouchableOpacity style={styles.viewAll} onPress={() => router.push('/activities')}>
                <Text style={styles.viewAllText}>{t('viewAll')}</Text>
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} color="#10B981" strokeWidth={2} />
              </TouchableOpacity>
            )}
          </View>

          {activities.length === 0 ? (
            <View style={styles.activityEmpty}>
              <Text style={styles.emptyText}>{t('noRecentActivity')}</Text>
            </View>
          ) : (
            <ActivityFeedCard items={activities} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function WStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.wStat}>
      <Text style={styles.wStatLabel}>{label}</Text>
      <Text style={styles.wStatValue}>{value}</Text>
    </View>
  );
}

function FarmCard({ farm, width, onPress, t }: { farm: any; width: number; onPress: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  const mapped = isFarmBoundaryMapped(farm);
  const size = farm.actualAcres
    ? `${farm.actualAcres} ac`
    : farm.socialHectares
      ? `${farm.socialHectares} ha`
      : '—';
  return (
    <TouchableOpacity style={[styles.farmCard, { width }]} activeOpacity={0.85} onPress={onPress}>
      <View style={styles.farmTop}>
        <View style={styles.farmIconBox}><Text style={{ fontSize: 22 }}>🌾</Text></View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.farmCode}>{farm.farmCode}</Text>
          <Text style={styles.farmName} numberOfLines={1}>{farm.name || farm.village || t('farm')}</Text>
        </View>
        <View style={[styles.fBadge, farm.isVerified ? styles.fBadgeGreen : styles.fBadgeGold]}>
          <Text style={farm.isVerified ? styles.fBadgeGreenText : styles.fBadgeGoldText}>
            {farm.isVerified ? t('verified') : t('pending')}
          </Text>
        </View>
      </View>
      <View style={styles.farmStats}>
        <FMini label={t('size')} value={size} />
        <FMini label={t('plots')} value={`${farm._count?.plots ?? 0}`} />
        <FMini label={t('grade')} value={farm.grade || '—'} />
        <FMini label={t('gps')} value={mapped ? t('mapped') : t('notMapped')} valueColor={mapped ? '#10B981' : '#9CA3AF'} />
      </View>
    </TouchableOpacity>
  );
}

function FMini({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.fMini}>
      <Text style={styles.fMiniLabel}>{label}</Text>
      <Text style={[styles.fMiniValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

function QuickAction({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: any;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.quickIcon}>
        <HugeiconsIcon icon={icon} size={18} color="#065F46" strokeWidth={2} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );
}

// Brand dark green — matches the farm/boundary stack headers and GPS buttons.
const HERO_GREEN = '#065F46';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: HERO_GREEN },
  scroll: { flex: 1, backgroundColor: '#F3F4F6' },

  // Hero
  hero: {
    backgroundColor: HERO_GREEN,
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  greetRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  hi: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },
  welcome: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 1 },
  bell: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },

  // Weather card
  weatherCard: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  weatherTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  city: { color: '#fff', fontSize: 16, fontWeight: '700' },
  weatherEmoji: { fontSize: 40 },
  weatherMid: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 6 },
  temp: { color: '#fff', fontSize: 56, fontWeight: '800', lineHeight: 62 },
  tempUnit: { fontSize: 24, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  condition: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  datetime: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  weatherProvider: { color: 'rgba(255,255,255,0.68)', fontSize: 10, marginTop: 3 },
  weatherDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 16 },
  weatherStats: { flexDirection: 'row', justifyContent: 'space-between' },
  wStat: { flex: 1 },
  wStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 4 },
  wStatValue: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Body
  body: { padding: 20 },

  // My Farms
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  viewAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  viewAllText: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  alertCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFBEB',
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#FDE68A',
  },
  alertIconWrap: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  alertTitle: { fontSize: 14, fontWeight: '800', color: '#92400E' },
  alertPreview: { fontSize: 12, color: '#B45309', marginTop: 2 },
  claimBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#D1FAE5',
    borderRadius: 14, padding: 14, marginBottom: 22, borderWidth: 1, borderColor: '#6EE7B7',
  },
  claimIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(6,95,70,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  claimTitle: { fontSize: 14, fontWeight: '800', color: '#065F46' },
  claimSub: { fontSize: 12, color: '#047857', marginTop: 2 },
  quickHint: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginBottom: 12 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickAction: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  quickIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickLabel: { fontSize: 12, fontWeight: '700', color: '#065F46', textAlign: 'center', lineHeight: 16 },
  seasonLink: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    paddingVertical: 12,
  },
  seasonLinkText: { fontSize: 13, fontWeight: '800', color: '#065F46' },
  farmCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, marginRight: 12,
    borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  farmTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  farmIconBox: { width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', justifyContent: 'center' },
  farmCode: { fontSize: 17, fontWeight: '800', color: '#065F46' },
  farmName: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  fBadge: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10 },
  fBadgeGreen: { backgroundColor: 'rgba(16,185,129,0.15)' },
  fBadgeGreenText: { color: '#10B981', fontSize: 11, fontWeight: '700' },
  fBadgeGold: { backgroundColor: 'rgba(245,158,11,0.15)' },
  fBadgeGoldText: { color: '#F59E0B', fontSize: 11, fontWeight: '700' },
  farmStats: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#F3F4F6' },
  fMini: { flex: 1 },
  fMiniLabel: { fontSize: 11, color: '#6B7280', marginBottom: 3 },
  fMiniValue: { fontSize: 15, fontWeight: '800', color: '#111827' },
  emptyFarmCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 24, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'flex-start' },
  emptyFarmTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 6 },
  emptyFarmDesc: { fontSize: 13, color: '#6B7280', lineHeight: 20, marginBottom: 16 },
  registerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#10B981', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  registerBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },

  // Recent Activities
  activityEmpty: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#E8ECF0', alignItems: 'center' },

  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, marginHorizontal: 4,
    borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  statIcon: { fontSize: 24, marginBottom: 8 },
  statValue: { fontSize: 26, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  actionGrid: { marginBottom: 24 },
  actionCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 18,
    marginBottom: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  actionIcon: { fontSize: 28, marginRight: 16 },
  actionTextContainer: { flex: 1 },
  actionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  actionDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  priceContainer: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  priceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  unitText: { fontSize: 12, color: '#6B7280' },
  priceCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB',
    padding: 14, borderRadius: 12, marginTop: 10, borderWidth: 1, borderColor: '#F3F4F6',
  },
  commodityText: { fontSize: 14, fontWeight: '700', color: '#111827' },
  marketText: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  priceText: { fontSize: 16, fontWeight: '800', color: '#10B981' },
  emptyText: { color: '#6B7280', textAlign: 'center', paddingVertical: 20 },
});
