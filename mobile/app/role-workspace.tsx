import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  Alert02Icon,
  ArrowRight01Icon,
  ClipboardIcon,
  MapsSearchIcon,
  Plant01Icon,
  TaskDaily01Icon,
  Tick02Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons';
import { BarChart, LineChart, PieChart } from 'react-native-gifted-charts';
import { officerVisitsApi, workspaceApi } from '../src/lib/data';
import {
  breakdownFarmerStats,
  normalizeVisits,
  visitsByPurpose,
  weeklyVisitTrend,
  type FarmerVerificationStats,
  type PurposeBar,
  type WeeklyVisitPoint,
} from '../src/lib/officer-stats';
import { useI18n } from '../src/i18n';
import { useAuthStore } from '../src/store/auth.store';
import { NotificationBell } from './(drawer)/(tabs)/_layout';

type Props = { role: string };

const HERO_GREEN = '#065F46';

const COPY: Record<string, { primary: string; route: string; icon: any }> = {
  FIELD_OFFICER: { primary: 'Open field surveys', route: '/field-survey', icon: MapsSearchIcon },
  MAMCOS_SECRETARY: { primary: 'Manage farms', route: '/farms', icon: ClipboardIcon },
  ADMIN: { primary: 'Open web dashboard', route: '/profile', icon: UserGroupIcon },
  SUPER_ADMIN: { primary: 'Open web dashboard', route: '/profile', icon: UserGroupIcon },
};

type WorkspaceContext = {
  mamcos?: { id: string; name: string } | null;
  assignedArea?: string | null;
  metrics?: {
    pendingVerifications?: number;
    myFarmersCount?: number;
    visitsThisWeek?: number;
    farmerVerification?: {
      verified?: number;
      pending?: number;
      other?: number;
    };
  };
  workQueue?: any[];
};

type OfficerChartData = {
  farmerStats: FarmerVerificationStats;
  weeklyVisits: WeeklyVisitPoint[];
  purposeBars: PurposeBar[];
};

export default function RoleWorkspaceDashboard({ role }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useI18n();
  const user = useAuthStore((state) => state.user);
  const copy = COPY[role] ?? COPY.FIELD_OFFICER;
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [chartData, setChartData] = useState<OfficerChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const name = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
    : t('farmerFallback');
  const initial = (user?.firstName?.[0] || 'O').toUpperCase();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ctxRes = await workspaceApi.context();
      const ctx = ctxRes.data as WorkspaceContext;
      setContext(ctx);

      const from = new Date();
      from.setDate(from.getDate() - 42);

      const visitsRes = await officerVisitsApi.mine({ from: from.toISOString(), pageSize: 100 });
      const visits = normalizeVisits(visitsRes);

      setChartData({
        farmerStats: breakdownFarmerStats(ctx?.metrics?.farmerVerification),
        weeklyVisits: weeklyVisitTrend(visits),
        purposeBars: visitsByPurpose(visits),
      });
    } catch {
      setContext(null);
      setChartData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (role === 'FIELD_OFFICER') {
    const cardW = width - 40;

    return (
      <View style={styles.officerScreen}>
        <StatusBar style="light" />
        <ScrollView
          style={styles.officerScroll}
          contentContainerStyle={{ paddingBottom: 88 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#fff" />}
        >
          <View style={styles.heroWrap}>
            <View style={[styles.hero, { paddingTop: insets.top + 14 }]}>
              <View style={styles.greetRow}>
                <TouchableOpacity style={styles.greetLeft} onPress={() => router.push('/profile')} activeOpacity={0.8}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.greet} numberOfLines={1}>{t('welcomeBack')}</Text>
                    <Text style={styles.userName} numberOfLines={1}>{name}</Text>
                  </View>
                </TouchableOpacity>
                <NotificationBell light />
              </View>
            </View>

            <View style={styles.homeStatsCard}>
              <OfficerHomeStat
                value={loading ? '—' : String(context?.metrics?.pendingVerifications ?? context?.workQueue?.length ?? 0)}
                label={t('pendingVerifications')}
                onPress={!loading && context?.workQueue?.[0]
                  ? () => openLease(router, context.workQueue![0])
                  : undefined}
              />
              <View style={styles.homeStatDivider} />
              <OfficerHomeStat
                value={loading ? '—' : String(context?.metrics?.myFarmersCount ?? 0)}
                label={t('farmersManaged')}
              />
              <View style={styles.homeStatDivider} />
              <OfficerHomeStat
                value={loading ? '—' : String(context?.metrics?.visitsThisWeek ?? 0)}
                label={t('visitsThisWeek')}
              />
            </View>
          </View>

          <View style={styles.body}>
            {loading ? (
              <ActivityIndicator style={{ marginTop: 24 }} color="#059669" />
            ) : (
              <>
                <OfficerChartsSection chartData={chartData} t={t} width={cardW} />
                <FieldOfficerBody context={context} t={t} router={router} />
              </>
            )}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.fab, { bottom: 16 }]}
          onPress={() => router.push('/field-survey')}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={t('fieldSurvey')}
        >
          <HugeiconsIcon icon={MapsSearchIcon} size={24} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.appBarSafe}>
        <StatusBar style="light" />
        <View style={styles.appBar}>
          <TouchableOpacity style={styles.appBarLeft} onPress={() => router.push('/profile')} activeOpacity={0.8}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.greet} numberOfLines={1}>{t('welcomeBack')}</Text>
              <Text style={styles.userName} numberOfLines={1}>{name}</Text>
            </View>
          </TouchableOpacity>
          <NotificationBell light />
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.pageContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#065F46" />}
      >
        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color="#059669" />
        ) : (
          <StaffWorkspaceFallback role={role} context={context} copy={copy} t={t} router={router} />
        )}
      </ScrollView>
    </View>
  );
}

function openLease(router: ReturnType<typeof useRouter>, item: any) {
  router.push({
    pathname: '/lease-verify',
    params: {
      leaseId: item.id,
      farmCode: item.farm?.farmCode || item.farm?.name || '',
      seasonName: item.farmingSeason?.name || '',
      renterName: item.renterFarmer
        ? `${item.renterFarmer.firstName} ${item.renterFarmer.lastName}`
        : (item.renterName || item.renterPhone || ''),
    },
  });
}

function OfficerHomeStat({
  value,
  label,
  onPress,
}: {
  value: string;
  label: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.homeStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.homeStatLabel} numberOfLines={2}>{label}</Text>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.homeStat} onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.homeStat}>{content}</View>;
}

function FieldOfficerBody({
  context,
  t,
  router,
}: {
  context: WorkspaceContext | null;
  t: ReturnType<typeof useI18n>['t'];
  router: ReturnType<typeof useRouter>;
}) {
  const queue = context?.workQueue ?? [];
  const pending = context?.metrics?.pendingVerifications ?? queue.length;

  return (
    <View style={[styles.focusCard, { marginTop: 16 }]}>
      <View style={styles.focusHead}>
        <Text style={styles.focusTitle}>{t('officerTodaysWork')}</Text>
        {pending > 0 ? (
          <View style={styles.focusBadge}>
            <Text style={styles.focusBadgeText}>{pending}</Text>
          </View>
        ) : null}
      </View>

      {queue.length === 0 ? (
        <View style={styles.caughtUp}>
          <View style={styles.caughtUpIcon}>
            <HugeiconsIcon icon={Tick02Icon} size={26} color="#059669" strokeWidth={2} />
          </View>
          <Text style={styles.caughtUpTitle}>{t('officerAllCaughtUp')}</Text>
          <Text style={styles.caughtUpHint}>{t('officerAllCaughtUpHint')}</Text>
        </View>
      ) : (
        queue.slice(0, 3).map((item: any) => (
          <TouchableOpacity key={item.id} style={styles.queueRow} onPress={() => openLease(router, item)} activeOpacity={0.85}>
            <View style={styles.queueIcon}>
              <HugeiconsIcon icon={Alert02Icon} size={18} color="#B45309" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle} numberOfLines={1}>
                {item.farm?.name || item.farm?.farmCode || t('farm')}
              </Text>
              <Text style={styles.queueSub} numberOfLines={1}>
                {item.renterFarmer
                  ? `${item.renterFarmer.firstName} ${item.renterFarmer.lastName}`
                  : t('renterConfirmationAccepted')}
              </Text>
            </View>
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} color="#9CA3AF" strokeWidth={2} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

function OfficerChartsSection({
  chartData,
  t,
  width,
}: {
  chartData: OfficerChartData | null;
  t: ReturnType<typeof useI18n>['t'];
  width: number;
}) {
  if (!chartData) return null;

  const { farmerStats, weeklyVisits, purposeBars } = chartData;
  const farmerTotal = farmerStats.verified + farmerStats.pending + farmerStats.other;
  const visitTotal = weeklyVisits.reduce((sum, point) => sum + point.value, 0);
  const hasOverview = farmerTotal > 0 || purposeBars.length > 0;
  const hasTrend = visitTotal > 0;

  if (!hasOverview && !hasTrend) {
    return (
      <View style={styles.chartsCard}>
        <Text style={styles.sectionTitle}>{t('officerWorkOverview')}</Text>
        <Text style={styles.chartsEmpty}>{t('noOfficerStats')}</Text>
      </View>
    );
  }

  const pieData = [
    { value: farmerStats.verified, color: '#10B981' },
    { value: farmerStats.pending, color: '#F59E0B' },
    { value: farmerStats.other, color: '#9CA3AF' },
  ].filter((slice) => slice.value > 0);

  const barColW = Math.floor(width * 0.48);
  const barWidth = Math.max(12, Math.min(22, Math.floor(barColW / Math.max(purposeBars.length, 1) - 10)));

  return (
    <>
      {hasOverview ? (
        <View style={styles.chartsCard}>
          <Text style={styles.sectionTitle}>{t('officerWorkOverview')}</Text>
          <View style={styles.chartsRow}>
            <View style={styles.chartsPieCol}>
              {farmerTotal > 0 ? (
                <>
                  <Text style={styles.chartsSubTitle}>{t('farmerVerificationMix')}</Text>
                  <PieChart data={pieData} donut radius={42} innerRadius={22} isAnimated={false} />
                  <View style={styles.chartsLegend}>
                    <ChartLegendDot color="#10B981" label={t('farmersVerified')} value={farmerStats.verified} />
                    <ChartLegendDot color="#F59E0B" label={t('farmersPending')} value={farmerStats.pending} />
                    {farmerStats.other > 0 ? (
                      <ChartLegendDot color="#9CA3AF" label={t('farmersOther')} value={farmerStats.other} />
                    ) : null}
                  </View>
                </>
              ) : (
                <Text style={styles.chartsEmptySmall}>{t('noOfficerStats')}</Text>
              )}
            </View>
            <View style={styles.chartsBarCol}>
              <Text style={styles.chartsSubTitle}>{t('visitsByPurpose')}</Text>
              {purposeBars.length > 0 ? (
                <BarChart
                  data={purposeBars.map((bar) => ({ value: bar.value, label: bar.label }))}
                  maxValue={Math.max(...purposeBars.map((b) => b.value), 1)}
                  noOfSections={2}
                  height={100}
                  width={barColW}
                  barWidth={barWidth}
                  frontColor={HERO_GREEN}
                  spacing={8}
                  initialSpacing={4}
                  endSpacing={4}
                  hideRules
                  xAxisThickness={1}
                  yAxisThickness={0}
                  yAxisTextStyle={{ fontSize: 8, color: '#9CA3AF' }}
                  xAxisLabelTextStyle={{ fontSize: 8, color: '#6B7280' }}
                  xAxisColor="#E5E7EB"
                  isAnimated={false}
                  disableScroll
                />
              ) : (
                <Text style={styles.chartsEmptySmall}>{t('noOfficerStats')}</Text>
              )}
            </View>
          </View>
        </View>
      ) : null}

      {hasTrend ? (
        <View style={[styles.chartsCard, { marginTop: 14 }]}>
          <Text style={styles.sectionTitle}>{t('officerVisitTrend')}</Text>
          <LineChart
            data={weeklyVisits.map((point) => ({ value: point.value, label: point.label }))}
            areaChart
            curved
            color={HERO_GREEN}
            startFillColor="rgba(6,95,70,0.28)"
            endFillColor="rgba(6,95,70,0.02)"
            startOpacity={0.9}
            endOpacity={0.1}
            thickness={2}
            height={150}
            width={width - 28}
            maxValue={Math.max(...weeklyVisits.map((p) => p.value), 1)}
            noOfSections={3}
            hideRules
            yAxisTextStyle={{ fontSize: 9, color: '#9CA3AF' }}
            xAxisLabelTextStyle={{ fontSize: 9, color: '#6B7280' }}
            xAxisColor="#E5E7EB"
            spacing={Math.max(28, Math.floor((width - 60) / weeklyVisits.length))}
            initialSpacing={8}
            endSpacing={8}
            isAnimated={false}
            disableScroll
          />
        </View>
      ) : null}
    </>
  );
}

function ChartLegendDot({ color, label, value }: { color: string; label: string; value?: number }) {
  return (
    <View style={styles.chartLegendRow}>
      <View style={[styles.chartLegendSwatch, { backgroundColor: color }]} />
      <Text style={styles.chartLegendText} numberOfLines={1}>
        {value == null ? label : `${label} ${value}`}
      </Text>
    </View>
  );
}

function StaffWorkspaceFallback({
  role,
  context,
  copy,
  t,
  router,
}: {
  role: string;
  context: WorkspaceContext | null;
  copy: { primary: string; route: string; icon: any };
  t: ReturnType<typeof useI18n>['t'];
  router: ReturnType<typeof useRouter>;
}) {
  const metrics = context?.metrics ?? {};
  const queue = context?.workQueue ?? [];

  return (
    <>
      {Object.keys(metrics).length > 0 ? (
        <>
          <Text style={styles.section}>{t('officerTodaysWork')}</Text>
          <View style={styles.statStrip}>
            {Object.entries(metrics).map(([key, value]) => (
              <View style={styles.statTile} key={key}>
                <Text style={styles.statValue}>{String(value)}</Text>
                <Text style={styles.statLabel} numberOfLines={2}>{metricLabel(key, t)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      {queue.length > 0 ? queue.slice(0, 5).map((item: any) => (
        <TouchableOpacity
          key={item.id}
          style={styles.queueRow}
          onPress={() => openLease(router, item)}
        >
          <HugeiconsIcon icon={TaskDaily01Icon} size={20} color="#047857" strokeWidth={2} />
          <View style={{ flex: 1 }}>
            <Text style={styles.queueTitle}>{item.farm?.name || item.farm?.farmCode || t('farm')}</Text>
            <Text style={styles.queueSub}>{t('renterConfirmationAccepted')}</Text>
          </View>
          <HugeiconsIcon icon={ArrowRight01Icon} size={18} color="#6B7280" strokeWidth={2} />
        </TouchableOpacity>
      )) : null}

      {role === 'MAMCOS_SECRETARY' ? (
        <>
          <View style={styles.note}>
            <HugeiconsIcon icon={Alert02Icon} size={20} color="#B45309" strokeWidth={2} />
            <Text style={styles.noteText}>Your workspace is restricted to your assigned AMCOS.</Text>
          </View>
          <TouchableOpacity style={styles.secondary} onPress={() => router.push('/officer-new')}>
            <HugeiconsIcon icon={UserGroupIcon} size={19} color="#065F46" strokeWidth={2} />
            <Text style={styles.secondaryText}>Create Field Officer</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <TouchableOpacity style={styles.primary} onPress={() => router.push(copy.route as any)}>
        <HugeiconsIcon icon={Plant01Icon} size={19} color="#fff" strokeWidth={2} />
        <Text style={styles.primaryText}>{copy.primary}</Text>
      </TouchableOpacity>
    </>
  );
}

function metricLabel(key: string, t: ReturnType<typeof useI18n>['t']) {
  const map: Record<string, string> = {
    pendingVerifications: t('pendingVerifications'),
    myFarmersCount: t('farmersManaged'),
    visitsThisWeek: t('visitsThisWeek'),
  };
  return map[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (v) => v.toUpperCase());
}

const styles = StyleSheet.create({
  officerScreen: { flex: 1, backgroundColor: HERO_GREEN },
  officerScroll: { flex: 1, backgroundColor: '#F3F4F6' },
  heroWrap: { paddingBottom: 40 },
  hero: {
    backgroundColor: HERO_GREEN,
    paddingHorizontal: 20,
    paddingBottom: 60,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  greetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  greetLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  homeStatsCard: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 0,
    height: 80,
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  homeStat: {
    flex: 1,
    height: 80,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeStatValue: { fontSize: 20, fontWeight: '800', color: HERO_GREEN },
  homeStatLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 4, textAlign: 'center' },
  homeStatDivider: { width: 1, height: 36, backgroundColor: '#E5E7EB' },
  body: { paddingHorizontal: 20, paddingTop: 12 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 10,
  },
  screen: { flex: 1, backgroundColor: '#F3F4F6' },
  appBarSafe: { backgroundColor: HERO_GREEN },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: HERO_GREEN,
    gap: 10,
  },
  appBarLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 8 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  greet: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600' },
  userName: { color: '#fff', fontSize: 17, fontWeight: '800', marginTop: 1 },
  page: { flex: 1, backgroundColor: '#F3F4F6' },
  pageContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },
  focusCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  focusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  focusTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  focusBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  focusBadgeText: { fontSize: 13, fontWeight: '800', color: '#B45309' },
  caughtUp: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8 },
  caughtUpIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  caughtUpTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  caughtUpHint: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19, marginTop: 6 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  queueIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  queueSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12 },
  chartsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chartsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  chartsPieCol: { flex: 1, alignItems: 'center' },
  chartsBarCol: { flex: 1.1, minWidth: 0 },
  chartsSubTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginBottom: 6, alignSelf: 'flex-start' },
  chartsLegend: { marginTop: 8, alignSelf: 'stretch', gap: 4 },
  chartLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chartLegendSwatch: { width: 8, height: 8, borderRadius: 4 },
  chartLegendText: { fontSize: 11, color: '#4B5563', flex: 1 },
  chartsEmpty: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingVertical: 16 },
  chartsEmptySmall: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  statStrip: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  statTile: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 4,
    minHeight: 88,
  },
  statValue: { fontSize: 22, fontWeight: '800', color: '#047857', marginTop: 2 },
  statLabel: { fontSize: 10, fontWeight: '600', color: '#6B7280', lineHeight: 13 },
  section: { color: '#111827', fontSize: 15, fontWeight: '800', marginTop: 20, marginBottom: 10 },
  note: {
    marginTop: 18,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  noteText: { flex: 1, color: '#92400E', fontSize: 13, lineHeight: 18 },
  primary: {
    backgroundColor: '#059669',
    borderRadius: 14,
    padding: 16,
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: HERO_GREEN,
    borderRadius: 14,
    padding: 15,
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  secondaryText: { color: HERO_GREEN, fontSize: 14, fontWeight: '800' },
});
