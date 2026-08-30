import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
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
import { BarChart, PieChart } from 'react-native-gifted-charts';
import Svg, { Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { officerVisitsApi, workspaceApi } from '../src/lib/data';
import {
  breakdownFarmerStats,
  buildVisitTrend,
  normalizeVisits,
  visitsByPurpose,
  type FarmerVerificationStats,
  type PurposeBar,
} from '../src/lib/officer-stats';
import type { TrendRange } from '../src/lib/finance-trend';
import { useI18n } from '../src/i18n';
import { useAuthStore } from '../src/store/auth.store';
import { UserAvatar } from '../src/components/UserAvatar';
import { refreshUserProfile } from '../src/hooks/useProfilePhoto';
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
  visits: any[];
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
    if (user?.id) {
      try {
        await refreshUserProfile(user.id);
      } catch {
        /* keep cached photo */
      }
    }
    setLoading(true);
    try {
      const ctxRes = await workspaceApi.context();
      const ctx = ctxRes.data as WorkspaceContext;
      setContext(ctx);

      const from = new Date();
      from.setDate(from.getDate() - 365);

      const visitsRes = await officerVisitsApi.mine({ from: from.toISOString(), pageSize: 100 });
      const visits = normalizeVisits(visitsRes);

      setChartData({
        farmerStats: breakdownFarmerStats(ctx?.metrics?.farmerVerification),
        visits,
        purposeBars: visitsByPurpose(visits),
      });
    } catch {
      setContext(null);
      setChartData(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

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
                  <UserAvatar
                    size={48}
                    photoUrl={user?.profilePhotoUrl}
                    name={user?.firstName || initial}
                    fallbackColor="rgba(255,255,255,0.2)"
                    borderColor="rgba(255,255,255,0.45)"
                    textStyle={styles.avatarText}
                  />
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

function compactVisitCount(n: number) {
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

function visitYLabels(maxValue: number) {
  if (maxValue <= 1) return ['1', '', '', '0'];
  return [3, 2, 1, 0].map((step) => compactVisitCount((maxValue * step) / 3));
}

function visitLinePath(points: { value: number }[], xAt: (i: number) => number, yAt: (v: number) => number) {
  return points
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(point.value).toFixed(1)}`)
    .join(' ');
}

function visitAreaPath(points: { value: number }[], xAt: (i: number) => number, yAt: (v: number) => number) {
  if (!points.length) return '';
  const last = points.length - 1;
  const base = yAt(0).toFixed(1);
  return `${visitLinePath(points, xAt, yAt)} L${xAt(last).toFixed(1)} ${base} L${xAt(0).toFixed(1)} ${base} Z`;
}

function VisitTrendPlot({
  points,
  width,
  height = 176,
}: {
  points: { value: number; label: string }[];
  width: number;
  height?: number;
}) {
  const padT = 6;
  const padB = 22;
  const padL = 4;
  const padR = 6;
  const plotW = Math.max(width - padL - padR, 1);
  const plotH = height - padT - padB;
  const maxValue = Math.max(1, ...points.map((p) => p.value));
  const count = Math.max(points.length, 1);
  const xAt = (i: number) => padL + (count <= 1 ? plotW / 2 : (plotW * i) / (count - 1));
  const yAt = (value: number) => padT + plotH * (1 - value / maxValue);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="visitArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={HERO_GREEN} stopOpacity="0.38" />
          <Stop offset="1" stopColor={HERO_GREEN} stopOpacity="0.04" />
        </LinearGradient>
      </Defs>
      {[0, 1, 2, 3].map((step) => {
        const y = padT + (plotH * step) / 3;
        return <Line key={step} x1={padL} y1={y} x2={width - padR} y2={y} stroke="#F3F4F6" strokeWidth={1} />;
      })}
      <Line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="#E5E7EB" strokeWidth={1} />
      {points.length ? (
        <>
          <Path d={visitAreaPath(points, xAt, yAt)} fill="url(#visitArea)" stroke="none" />
          <Path
            d={visitLinePath(points, xAt, yAt)}
            stroke={HERO_GREEN}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      ) : null}
      {points.map((point, i) => (
        <SvgText
          key={`${point.label}-${i}`}
          x={xAt(i)}
          y={height - 5}
          fontSize={10}
          fill="#6B7280"
          textAnchor={i === 0 ? 'start' : i === count - 1 ? 'end' : 'middle'}
        >
          {point.label}
        </SvgText>
      ))}
    </Svg>
  );
}

function VisitTrendCard({
  visits,
  t,
  width,
  cardStyle,
}: {
  visits: any[];
  t: ReturnType<typeof useI18n>['t'];
  width: number;
  cardStyle?: object;
}) {
  const [range, setRange] = useState<TrendRange>('monthly');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0, w: 148 });
  const triggerRef = useRef<View>(null);
  const series = buildVisitTrend(visits, range);
  const hasData = visits.length > 0;
  const ranges: { id: TrendRange; label: string }[] = [
    { id: 'weekly', label: t('rangeWeekly') },
    { id: 'monthly', label: t('rangeMonthly') },
    { id: 'yearly', label: t('rangeYearly') },
  ];
  const currentLabel = ranges.find((item) => item.id === range)?.label ?? t('rangeMonthly');
  const maxValue = Math.max(1, ...series.map((p) => p.value));
  const yLabels = visitYLabels(maxValue);
  const yAxisW = 36;
  const plotWidth = Math.max(width - 28 - yAxisW, 200);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, _w, h) => {
      const menuW = 148;
      const screenW = width + 40;
      setMenuPos({
        x: Math.min(Math.max(12, x), screenW - menuW - 12),
        y: y + h + 6,
        w: menuW,
      });
      setMenuOpen(true);
    });
  };

  return (
    <View style={[styles.chartsCard, cardStyle]}>
      <View style={styles.trendHead}>
        <View style={styles.trendLegend}>
          <ChartLegendDot color={HERO_GREEN} label={t('officerVisitTrend')} />
        </View>
        <View ref={triggerRef} collapsable={false}>
          <TouchableOpacity style={styles.rangeDropdown} onPress={openMenu} activeOpacity={0.75}>
            <Text style={styles.rangeDropdownText}>{currentLabel}</Text>
            <Text style={styles.rangeDropdownCaret}>▾</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.rangeMenuBackdrop} onPress={() => setMenuOpen(false)}>
          <View
            style={[styles.rangeMenu, { top: menuPos.y, left: menuPos.x, width: menuPos.w }]}
            onStartShouldSetResponder={() => true}
          >
            {ranges.map((item) => {
              const on = item.id === range;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.rangeMenuItem, on && styles.rangeMenuItemOn]}
                  onPress={() => {
                    setRange(item.id);
                    setMenuOpen(false);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.rangeMenuText, on && styles.rangeMenuTextOn]}>{item.label}</Text>
                  {on ? <HugeiconsIcon icon={Tick02Icon} size={16} color="#065F46" strokeWidth={2} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>
      {!hasData ? (
        <Text style={styles.chartsEmpty}>{t('noOfficerStats')}</Text>
      ) : (
        <View style={styles.trendPlotRow}>
          <View style={[styles.trendYAxis, { width: yAxisW }]}>
            {yLabels.map((label, i) => (
              <Text key={`${label}-${i}`} style={styles.trendYLabel}>{label}</Text>
            ))}
          </View>
          <View style={[styles.trendPlot, { width: plotWidth }]}>
            <VisitTrendPlot points={series} width={plotWidth} />
          </View>
        </View>
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

  const { farmerStats, visits, purposeBars } = chartData;
  const farmerTotal = farmerStats.verified + farmerStats.pending + farmerStats.other;
  const hasOverview = farmerTotal > 0 || purposeBars.length > 0;

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
                    <ChartLegendDot color="#10B981" label={t('farmersVerified')} />
                    <ChartLegendDot color="#F59E0B" label={t('farmersPending')} />
                    {farmerStats.other > 0 ? (
                      <ChartLegendDot color="#9CA3AF" label={t('farmersOther')} />
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

      <VisitTrendCard
        visits={visits}
        t={t}
        width={width}
        cardStyle={hasOverview ? { marginTop: 14 } : null}
      />
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
  chartsLegend: {
    marginTop: 8,
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  chartLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chartLegendSwatch: { width: 8, height: 8, borderRadius: 4 },
  chartLegendText: { fontSize: 10, color: '#4B5563' },
  chartsEmpty: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingVertical: 16 },
  chartsEmptySmall: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', paddingVertical: 24 },
  trendHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
  trendLegend: { flexDirection: 'row', flexShrink: 1, gap: 14 },
  trendPlotRow: { flexDirection: 'row', alignItems: 'stretch' },
  trendYAxis: { height: 176, justifyContent: 'space-between', paddingBottom: 20, paddingTop: 4, paddingRight: 6 },
  trendYLabel: { fontSize: 9, color: '#9CA3AF', textAlign: 'right' },
  trendPlot: { height: 176, flex: 1, minWidth: 0 },
  rangeDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  rangeDropdownText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  rangeDropdownCaret: { fontSize: 11, color: '#065F46', marginTop: -1 },
  rangeMenuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.12)' },
  rangeMenu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  rangeMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  rangeMenuItemOn: { backgroundColor: '#F0FDF4' },
  rangeMenuText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  rangeMenuTextOn: { color: '#065F46', fontWeight: '700' },
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
