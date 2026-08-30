import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions, Modal, Pressable } from 'react-native';
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
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { useAuthStore } from '../../../src/store/auth.store';
import { farmsApi, activitiesApi, alertsApi, registryApi, farmersApi, cropCyclesApi, financeApi } from '../../../src/lib/data';
import { fetchWeatherHere, WeatherData } from '../../../src/services/weather.service';
import { useI18n } from '../../../src/i18n';
import ActivityFeedCard from '../../../src/components/ActivityFeedCard';
import { DrawerMenuButton } from '../../../src/components/DrawerMenuButton';
import { isFarmBoundaryMapped } from '../../../src/lib/farm-geo';
import { pendingTaskCount, summarizeRiceTasks, type ActivityStats, type FarmPerfBar } from '../../../src/lib/activity-stats';
import { buildFinanceTrend, type CashEvent, type TrendRange } from '../../../src/lib/finance-trend';
import RoleWorkspaceDashboard from '../../role-workspace';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import Svg, { Path, Line, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';

export default function DashboardTab() {
  const { user, _hydrated } = useAuthStore();
  if (!_hydrated) return null;
  if (user?.role && user.role !== 'FARMER') {
    return <RoleWorkspaceDashboard role={user.role} />;
  }
  return <FarmerDashboardTab />;
}

function unwrapList(res: any): any[] {
  const raw = res?.data?.data ?? res?.data;
  return Array.isArray(raw) ? raw : [];
}

function unwrapRecord(res: any): any {
  const raw = res?.data?.data ?? res?.data;
  return raw && typeof raw === 'object' ? raw : null;
}

function eventsFromCycle(cycle: any): { income: CashEvent[]; expenses: CashEvent[] } {
  const income: CashEvent[] = [];
  const expenses: CashEvent[] = [];
  const costs = cycle.costsDetail ?? cycle.costs ?? [];
  const revenues = cycle.revenuesDetail ?? cycle.revenues ?? [];
  for (const cost of costs) {
    expenses.push({
      date: cost.dateIncurred ?? cost.date_incurred,
      amount: Number(cost.totalCost ?? cost.total_cost) || 0,
    });
  }
  for (const revenue of revenues) {
    income.push({
      date: revenue.saleDate ?? revenue.sale_date,
      amount:
        (Number(revenue.totalRevenue ?? revenue.total_revenue) || 0) +
        (Number(revenue.fairtradePremium ?? revenue.fairtrade_premium) || 0),
    });
  }
  return { income, expenses };
}

async function loadCashflow(
  farmerId: string,
  farmIds: string[],
  calendarEntries: any[],
): Promise<{ income: CashEvent[]; expenses: CashEvent[] }> {
  const cycleIds = new Set<string>();
  for (const row of unwrapList(await cropCyclesApi.getByFarmerId(farmerId).catch(() => ({ data: [] })))) {
    if (row?.id) cycleIds.add(row.id);
  }
  if (!cycleIds.size && farmIds.length) {
    const lists = await Promise.allSettled(farmIds.map((id) => cropCyclesApi.getByFarmId(id)));
    for (const list of lists) {
      if (list.status !== 'fulfilled') continue;
      for (const row of unwrapList(list.value)) {
        if (row?.id) cycleIds.add(row.id);
      }
    }
  }
  for (const entry of calendarEntries) {
    if (entry?.cropCycleId) cycleIds.add(entry.cropCycleId);
  }

  const income: CashEvent[] = [];
  const expenses: CashEvent[] = [];
  const summaries = await Promise.allSettled(
    [...cycleIds].map((id) => financeApi.getCropCycleSummary(id)),
  );
  for (const summary of summaries) {
    if (summary.status !== 'fulfilled') continue;
    const ev = eventsFromCycle(unwrapRecord(summary.value) ?? {});
    income.push(...ev.income);
    expenses.push(...ev.expenses);
  }
  return { income, expenses };
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
  const [yieldKg, setYieldKg] = useState<number | null>(null);
  const [pendingTasks, setPendingTasks] = useState<number | null>(null);
  const [activityStats, setActivityStats] = useState<ActivityStats>({ completed: 0, pending: 0, overdue: 0 });
  const [farmPerf, setFarmPerf] = useState<FarmPerfBar[]>([]);
  const [cashflow, setCashflow] = useState<{ income: CashEvent[]; expenses: CashEvent[] }>({ income: [], expenses: [] });

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const calFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const calTo = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59);
      const [farmsRes, actsRes, alertsRes, claimRes, prodRes, calRes] = await Promise.allSettled([
        farmerId ? farmsApi.getByFarmerId(farmerId) : farmsApi.getAll(),
        farmerId ? activitiesApi.recentForFarmer(farmerId, 5) : Promise.resolve({ data: [] as any[] }),
        alertsApi.list(),
        registryApi.mine(),
        farmerId ? farmersApi.productionSummary(farmerId) : Promise.resolve({ data: null }),
        farmerId
          ? cropCyclesApi.calendar({ from: calFrom.toISOString(), to: calTo.toISOString() })
          : Promise.resolve({ data: [] as any[] }),
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
      if (prodRes.status === 'fulfilled') {
        const kg = prodRes.value.data?.totalActualYieldKg;
        setYieldKg(typeof kg === 'number' ? kg : null);
      } else {
        setYieldKg(null);
      }
      if (calRes.status === 'fulfilled') {
        const entries = Array.isArray(calRes.value.data) ? calRes.value.data : [];
        const summary = summarizeRiceTasks(entries, now);
        setActivityStats(summary.stats);
        setFarmPerf(summary.farmPerf);
        setPendingTasks(pendingTaskCount(entries));
      } else {
        setActivityStats({ completed: 0, pending: 0, overdue: 0 });
        setFarmPerf([]);
        setPendingTasks(null);
      }
      const farmIds = (Array.isArray(farmsData) ? farmsData : []).map((farm: any) => farm.id).filter(Boolean);
      const calendarEntries = calRes.status === 'fulfilled' && Array.isArray(calRes.value.data) ? calRes.value.data : [];
      if (farmerId) {
        try {
          setCashflow(await loadCashflow(farmerId, farmIds, calendarEntries));
        } catch {
          setCashflow({ income: [], expenses: [] });
        }
      } else {
        setCashflow({ income: [], expenses: [] });
      }
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
        {/* ── Green weather hero + overlapping stats ── */}
        <View style={styles.heroWrap}>
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

          {/* Top half on green, bottom half on gray */}
          <View style={styles.homeStatsCard}>
            <HomeStat
              value={String(farms.length)}
              label={t('farms')}
              onPress={() => router.push('/farms')}
            />
            <View style={styles.homeStatDivider} />
            <HomeStat
              value={yieldKg == null ? '—' : `${yieldKg.toLocaleString()} kg`}
              label={t('totalYield')}
              onPress={() => router.push('/finances')}
            />
            <View style={styles.homeStatDivider} />
            <HomeStat
              value={pendingTasks == null ? '—' : String(pendingTasks)}
              label={t('pendingTasks')}
              onPress={() => router.push('/calendar')}
            />
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

          <View style={[styles.sectionHeaderRow, { marginTop: 26 }]}>
            <Text style={styles.sectionTitle}>{t('activityOverview')}</Text>
          </View>
          <ActivityOverviewCard stats={activityStats} farmPerf={farmPerf} t={t} width={cardW} />

          <View style={[styles.sectionHeaderRow, { marginTop: 26 }]}>
            <Text style={styles.sectionTitle}>{t('incomeExpenseTrend')}</Text>
          </View>
          <FinanceTrendCard income={cashflow.income} expenses={cashflow.expenses} t={t} width={cardW} />

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

function ActivityOverviewCard({
  stats,
  farmPerf,
  t,
  width,
}: {
  stats: ActivityStats;
  farmPerf: FarmPerfBar[];
  t: ReturnType<typeof useI18n>['t'];
  width: number;
}) {
  const total = stats.completed + stats.pending + stats.overdue;
  if (total === 0) {
    return (
      <View style={styles.chartsCard}>
        <Text style={styles.chartsEmpty}>{t('noActivityStats')}</Text>
      </View>
    );
  }

  const pieData = [
    { value: stats.completed, color: '#10B981' },
    { value: stats.pending, color: '#F59E0B' },
    { value: stats.overdue, color: '#DC2626' },
  ].filter((slice) => slice.value > 0);

  const barColW = Math.floor(width * 0.50);
  const barWidth = Math.max(12, Math.min(20, Math.floor(barColW / Math.max(farmPerf.length, 1) - 12)));

  return (
    <View style={styles.chartsCard}>
      <View style={styles.chartsRow}>
        <View style={styles.chartsPieCol}>
          <PieChart data={pieData} donut radius={44} innerRadius={24} isAnimated={false} />
          <View style={styles.chartsLegend}>
            <ChartLegendDot color="#10B981" label={t('activitiesCompleted')} value={stats.completed} />
            <ChartLegendDot color="#F59E0B" label={t('activitiesPending')} value={stats.pending} />
            <ChartLegendDot color="#DC2626" label={t('activitiesOverdue')} value={stats.overdue} />
          </View>
        </View>
        <View style={styles.chartsBarCol}>
          <Text style={styles.chartsBarTitle}>{t('farmPerformance')}</Text>
          <BarChart
            data={farmPerf.map((farm) => ({ value: farm.pct, label: farm.label }))}
            maxValue={100}
            noOfSections={2}
            height={90}
            width={barColW}
            barWidth={barWidth}
            frontColor="#065F46"
            spacing={10}
            initialSpacing={6}
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
        </View>
      </View>
    </View>
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

function compactAmount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

function linePath(points: { value: number }[], xAt: (i: number) => number, yAt: (v: number) => number) {
  return points
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)} ${yAt(point.value).toFixed(1)}`)
    .join(' ');
}

function areaPath(points: { value: number }[], xAt: (i: number) => number, yAt: (v: number) => number) {
  if (!points.length) return '';
  const last = points.length - 1;
  const base = yAt(0).toFixed(1);
  return `${linePath(points, xAt, yAt)} L${xAt(last).toFixed(1)} ${base} L${xAt(0).toFixed(1)} ${base} Z`;
}

function FinanceLinePlot({
  income,
  expenses,
  width,
  height = 176,
}: {
  income: { value: number; label: string }[];
  expenses: { value: number; label: string }[];
  width: number;
  height?: number;
}) {
  const padT = 6;
  const padB = 22;
  const padL = 4;
  const padR = 6;
  const plotW = Math.max(width - padL - padR, 1);
  const plotH = height - padT - padB;
  const maxValue = Math.max(1, ...income.map((p) => p.value), ...expenses.map((p) => p.value));
  const count = Math.max(income.length, 1);
  const xAt = (i: number) => padL + (count <= 1 ? plotW / 2 : (plotW * i) / (count - 1));
  const yAt = (value: number) => padT + plotH * (1 - value / maxValue);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="incomeArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#10B981" stopOpacity="0.38" />
          <Stop offset="1" stopColor="#10B981" stopOpacity="0.04" />
        </LinearGradient>
        <LinearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#DC2626" stopOpacity="0.28" />
          <Stop offset="1" stopColor="#DC2626" stopOpacity="0.03" />
        </LinearGradient>
      </Defs>
      {[0, 1, 2, 3].map((step) => {
        const y = padT + (plotH * step) / 3;
        return <Line key={step} x1={padL} y1={y} x2={width - padR} y2={y} stroke="#F3F4F6" strokeWidth={1} />;
      })}
      <Line x1={padL} y1={padT + plotH} x2={width - padR} y2={padT + plotH} stroke="#E5E7EB" strokeWidth={1} />
      {expenses.length ? (
        <>
          <Path d={areaPath(expenses, xAt, yAt)} fill="url(#expenseArea)" stroke="none" />
          <Path d={linePath(expenses, xAt, yAt)} stroke="#DC2626" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </>
      ) : null}
      {income.length ? (
        <>
          <Path d={areaPath(income, xAt, yAt)} fill="url(#incomeArea)" stroke="none" />
          <Path d={linePath(income, xAt, yAt)} stroke="#10B981" strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        </>
      ) : null}
      {income.map((point, i) => (
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

function FinanceTrendCard({
  income,
  expenses,
  t,
  width,
}: {
  income: CashEvent[];
  expenses: CashEvent[];
  t: ReturnType<typeof useI18n>['t'];
  width: number;
}) {
  const [range, setRange] = useState<TrendRange>('monthly');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0, w: 148 });
  const triggerRef = useRef<View>(null);
  const series = buildFinanceTrend(income, expenses, range);
  const hasData = income.length + expenses.length > 0;
  const ranges: { id: TrendRange; label: string }[] = [
    { id: 'weekly', label: t('rangeWeekly') },
    { id: 'monthly', label: t('rangeMonthly') },
    { id: 'yearly', label: t('rangeYearly') },
  ];
  const currentLabel = ranges.find((item) => item.id === range)?.label ?? t('rangeMonthly');

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, w, h) => {
      const menuW = Math.max(w, 148);
      const screenW = width + 40;
      setMenuPos({
        x: Math.min(Math.max(12, x), screenW - menuW - 12),
        y: y + h + 6,
        w: menuW,
      });
      setMenuOpen(true);
    });
  };

  const maxValue = Math.max(
    1,
    ...series.income.map((p) => p.value),
    ...series.expenses.map((p) => p.value),
  );
  const yLabels = [3, 2, 1, 0].map((step) => compactAmount((maxValue * step) / 3));
  const yAxisW = 36;
  const plotWidth = Math.max(width - 28 - yAxisW, 200);

  return (
    <View style={styles.chartsCard}>
      <View style={styles.trendHead}>
        <View style={styles.trendLegend}>
          <ChartLegendDot color="#10B981" label={t('income')} />
          <ChartLegendDot color="#DC2626" label={t('totalExpenses')} />
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
        <Text style={styles.chartsEmpty}>{t('noFinanceTrend')}</Text>
      ) : (
        <View style={styles.trendPlotRow}>
          <View style={[styles.trendYAxis, { width: yAxisW }]}>
            {yLabels.map((label, i) => (
              <Text key={`${label}-${i}`} style={styles.trendYLabel}>{label}</Text>
            ))}
          </View>
          <View style={[styles.trendPlot, { width: plotWidth }]}>
            <FinanceLinePlot income={series.income} expenses={series.expenses} width={plotWidth} />
          </View>
        </View>
      )}
    </View>
  );
}

function HomeStat({
  value,
  label,
  onPress,
}: {
  value: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.homeStat} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.homeStatValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.homeStatLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
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

// Brand dark green — matches the farm/boundary stack headers and GPS buttons.
const HERO_GREEN = '#065F46';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: HERO_GREEN },
  scroll: { flex: 1, backgroundColor: '#F3F4F6' },

  // Hero — wrap reserves the bottom half of the stats card on the gray body
  heroWrap: {
    paddingBottom: 40,
  },
  hero: {
    backgroundColor: HERO_GREEN,
    paddingHorizontal: 20,
    // 40 = half the stats card + 20 gap under weather
    paddingBottom: 60,
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
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  weatherTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 },
  city: { color: '#fff', fontSize: 16, fontWeight: '700' },
  weatherEmoji: { fontSize: 40 },
  weatherMid: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 },
  temp: { color: '#fff', fontSize: 56, fontWeight: '800', lineHeight: 62 },
  tempUnit: { fontSize: 24, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  condition: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  datetime: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  weatherProvider: { color: 'rgba(255,255,255,0.68)', fontSize: 10, marginTop: 3 },
  weatherDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 10 },
  weatherStats: { flexDirection: 'row', justifyContent: 'space-between' },
  wStat: { flex: 1 },
  wStatLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, marginBottom: 4 },
  wStatValue: { color: '#fff', fontSize: 15, fontWeight: '700' },

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
  homeStatValue: { fontSize: 20, fontWeight: '800', color: '#065F46' },
  homeStatLabel: { fontSize: 11, fontWeight: '600', color: '#6B7280', marginTop: 4, textAlign: 'center' },
  homeStatDivider: { width: 1, height: 36, backgroundColor: '#E5E7EB' },

  // Body
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20 },

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
  chartsBarTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginBottom: 6 },
  chartsLegend: { marginTop: 8, alignSelf: 'stretch', gap: 4 },
  chartLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chartLegendSwatch: { width: 8, height: 8, borderRadius: 4 },
  chartLegendText: { fontSize: 11, color: '#4B5563' },
  chartsEmpty: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingVertical: 16 },
  trendHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 },
  trendLegend: { flexDirection: 'row', flexShrink: 1, gap: 14 },
  trendPlotRow: { flexDirection: 'row', alignItems: 'stretch' },
  trendYAxis: { height: 176, justifyContent: 'space-between', paddingBottom: 20, paddingTop: 4, paddingRight: 6 },
  trendYLabel: { fontSize: 9, color: '#9CA3AF', textAlign: 'right' },
  trendPlot: { height: 176 },
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
  rangeMenuBackdrop: { flex: 1 },
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
