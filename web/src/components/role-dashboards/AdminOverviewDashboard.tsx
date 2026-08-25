'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Calendar01Icon,
  Upload04Icon,
  Globe02Icon,
  ChartBarLineIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  MapsIcon,
  WheatIcon,
  Plant01Icon,
} from '@hugeicons/core-free-icons';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CountUpValue } from '@/components/CountUpValue';
import { EmptyState, money } from '@/components/role-dashboards/DashboardPrimitives';
import { CHART_PALETTE } from '@/components/role-dashboards/Charts';
import {
  cropCyclesApi,
  farmersApi,
  farmsApi,
  fieldOfficerVisitsApi,
  inventoryApi,
  reportsApi,
  weatherApi,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

const WEATHER_HOME = { label: 'Mbarali', lat: -8.95, lon: 33.9 };

const tooltipStyle = {
  background: 'var(--surface-1)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 12,
  color: 'var(--text-1)',
  fontSize: 13,
  boxShadow: 'var(--shadow-md)',
};

function greetingForHour(hour: number) {
  if (hour < 12) return 'Good Morning!';
  if (hour < 17) return 'Good Afternoon!';
  return 'Good Evening!';
}

function formatLongDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function WeatherGlyph({ condition, size = 46 }: { condition: 'Sunny' | 'Cloudy' | 'Rainy'; size?: number }) {
  if (condition === 'Sunny') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <circle cx="32" cy="32" r="13" fill="#FBBF24" />
        <g stroke="#FBBF24" strokeWidth="3.5" strokeLinecap="round">
          <line x1="32" y1="6" x2="32" y2="12" />
          <line x1="32" y1="52" x2="32" y2="58" />
          <line x1="58" y1="32" x2="52" y2="32" />
          <line x1="12" y1="32" x2="6" y2="32" />
          <line x1="50.5" y1="13.5" x2="46.2" y2="17.8" />
          <line x1="17.8" y1="46.2" x2="13.5" y2="50.5" />
          <line x1="50.5" y1="50.5" x2="46.2" y2="46.2" />
          <line x1="17.8" y1="17.8" x2="13.5" y2="13.5" />
        </g>
      </svg>
    );
  }
  if (condition === 'Rainy') {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <path
          d="M18 40c-5.5 0-10-4.4-10-9.8 0-5 3.7-9.1 8.6-9.7C17.6 15 22.9 11 29 11c7.1 0 13 5.3 13.9 12.2 5 .6 8.8 4.7 8.8 9.7 0 5.4-4.5 9.8-10 9.8H18z"
          fill="#CBD5E1"
          stroke="#94A3B8"
          strokeWidth="1.2"
        />
        <g stroke="#3B82F6" strokeWidth="3" strokeLinecap="round">
          <line x1="22" y1="46" x2="19" y2="54" />
          <line x1="32" y1="46" x2="29" y2="54" />
          <line x1="42" y1="46" x2="39" y2="54" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <circle cx="39" cy="21" r="11" fill="#FBBF24" />
      <g stroke="#FBBF24" strokeWidth="3" strokeLinecap="round">
        <line x1="39" y1="3" x2="39" y2="7" />
        <line x1="57" y1="21" x2="53" y2="21" />
        <line x1="51.5" y1="8.5" x2="48.5" y2="11.5" />
        <line x1="51.5" y1="33.5" x2="48.5" y2="30.5" />
        <line x1="26.5" y1="11.5" x2="23.5" y2="8.5" />
      </g>
      <path
        d="M16 48c-5.5 0-10-4.4-10-9.8 0-5 3.7-9.1 8.6-9.7C15.7 22.9 21 19 27 19c7 0 12.8 5.2 13.8 11.9 5 .5 8.9 4.6 8.9 9.6 0 5.4-4.5 9.8-10 9.8H16z"
        fill="#F1F5F9"
        stroke="#CBD5E1"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function statusBadge(status: string) {
  const key = status.toLowerCase();
  if (key.includes('progress') || key.includes('active')) return 'badge-blue';
  if (key.includes('pending') || key.includes('verify')) return 'badge-gold';
  if (key.includes('done') || key.includes('verified') || key.includes('complete')) return 'badge-green';
  return 'badge-gray';
}

export default function AdminOverviewDashboard() {
  const user = useAuthStore((s) => s.user);
  const reduce = useReducedMotion();

  const [farmers, setFarmers] = useState<any[]>([]);
  const [farms, setFarms] = useState<any[]>([]);
  const [cropCycles, setCropCycles] = useState<any[]>([]);
  const [inventoryRecords, setInventoryRecords] = useState<any[]>([]);
  const [officerVisits, setOfficerVisits] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [weather, setWeather] = useState<any>(null);
  const [unit, setUnit] = useState<'C' | 'F'>('C');
  const [period, setPeriod] = useState('This Month');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      farmersApi.getAllUnpaginated(),
      farmsApi.getAll(),
      cropCyclesApi.getAll(),
      inventoryApi.getAll(),
      fieldOfficerVisitsApi.getAll(),
      reportsApi.kpis(),
      weatherApi.forecast(WEATHER_HOME.lat, WEATHER_HOME.lon),
    ]).then(([farmerResult, farmResult, cropCycleResult, inventoryResult, visitResult, kpiResult, weatherResult]) => {
      if (farmerResult.status === 'fulfilled') setFarmers(farmerResult.value.data || []);
      if (farmResult.status === 'fulfilled') setFarms(farmResult.value.data?.data || farmResult.value.data || []);
      if (cropCycleResult.status === 'fulfilled') setCropCycles(cropCycleResult.value.data || []);
      if (inventoryResult.status === 'fulfilled') setInventoryRecords(inventoryResult.value.data || []);
      if (visitResult.status === 'fulfilled') setOfficerVisits(visitResult.value.data || []);
      if (kpiResult.status === 'fulfilled') setKpis(kpiResult.value.data);
      if (weatherResult.status === 'fulfilled') setWeather(weatherResult.value.data);
      if (farmerResult.status === 'rejected' && farmResult.status === 'rejected') {
        setError('Unable to load MAYOData administration data.');
      }
      setLoading(false);
    });
  }, []);

  const totalLandHa = Math.round(kpis?.totalHectares || farms.reduce((s, f) => s + (f.socialHectares || 0), 0));
  const revenue = kpis?.totalRevenue ?? 0;

  const productionByVariety = useMemo(() => {
    const totals = cropCycles.reduce<Record<string, number>>((acc, cycle) => {
      const label = cycle.riceVariety || 'Unspecified';
      acc[label] = (acc[label] || 0) + (cycle.actualYieldKg || cycle.estimatedYieldKg || 0);
      return acc;
    }, {});
    return Object.entries(totals)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [cropCycles]);

  const totalProductionKg = useMemo(
    () => productionByVariety.reduce((s, row) => s + row.value, 0),
    [productionByVariety],
  );

  // Value-chain view: same grain, tracked as it moves from farm → cooperative intake → MAYODE-managed batching/export.
  const MAYODE_STAGE_STATUSES = ['BATCHED', 'SHIPPED', 'SOLD'];
  const productionLegend = useMemo(() => {
    const farmersKg = cropCycles.reduce(
      (s, c) => s + (c.actualYieldKg || c.estimatedYieldKg || 0),
      0,
    );
    const cooperativeKg = inventoryRecords.reduce((s, r) => s + (r.weightKg || 0), 0);
    const mayodeKg = inventoryRecords
      .filter((r) => MAYODE_STAGE_STATUSES.includes(r.status))
      .reduce((s, r) => s + (r.weightKg || 0), 0);

    const stageColors: Record<string, string> = {
      Farmers: 'var(--green-500)',
      Cooperative: 'var(--purple-500)',
      MAYODE: 'var(--blue-500)',
    };

    const rows = [
      { name: 'Farmers', value: Math.round(farmersKg) },
      { name: 'Cooperative', value: Math.round(cooperativeKg) },
      { name: 'MAYODE', value: Math.round(mayodeKg) },
    ];

    const total = rows.reduce((s, r) => s + r.value, 0) || 1;
    return rows.map((row) => ({
      ...row,
      pct: Math.round((row.value / total) * 100),
      color: stageColors[row.name],
    }));
  }, [cropCycles, inventoryRecords]);

  const totalProductionTons =
    Math.round((productionLegend.find((r) => r.name === 'Farmers')?.value ?? 0) / 1000) ||
    Math.round(totalProductionKg / 1000) ||
    Math.round(inventoryRecords.reduce((s, r) => s + (r.weightKg || 0), 0) / 1000);

  const productionRays = useMemo(() => {
    const active = productionLegend.filter((r) => r.pct > 0);
    if (!active.length) return [];
    const total = active.reduce((s, r) => s + r.value, 0) || 1;
    let cum = 0;
    const segments = active.map((row) => {
      const start = cum;
      cum += row.value / total;
      return { color: row.color, start, end: cum };
    });
    const RAY_COUNT = 20;
    const cx = 100;
    const cy = 86;
    const innerR = 44;
    const outerR = 70;
    return Array.from({ length: RAY_COUNT }, (_, i) => {
      const t = i / (RAY_COUNT - 1);
      const angleDeg = 180 - t * 180;
      const angleRad = (angleDeg * Math.PI) / 180;
      const seg = segments.find((s) => t <= s.end + 1e-9) || segments[segments.length - 1];
      return {
        x1: cx + innerR * Math.cos(angleRad),
        y1: cy - innerR * Math.sin(angleRad),
        x2: cx + outerR * Math.cos(angleRad),
        y2: cy - outerR * Math.sin(angleRad),
        color: seg.color,
      };
    });
  }, [productionLegend]);

  const yieldTrend = useMemo(() => {
    const buckets = new Map<string, { label: string; sort: number; yield: number }>();
    for (const cycle of cropCycles) {
      const raw = cycle.harvestDate || cycle.endDate || cycle.createdAt;
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;
      const sort = d.getFullYear() * 12 + d.getMonth();
      const label = d.toLocaleDateString(undefined, { month: 'short' });
      const prev = buckets.get(String(sort)) || { label, sort, yield: 0 };
      prev.yield += cycle.actualYieldKg || cycle.estimatedYieldKg || 0;
      buckets.set(String(sort), prev);
    }
    return [...buckets.values()]
      .sort((a, b) => a.sort - b.sort)
      .slice(-9)
      .map((row) => ({ month: row.label, yield: Math.round(row.yield / 1000) }));
  }, [cropCycles]);

  const featuredFarm = useMemo(() => {
    return (
      farms.find((f) => f.isVerified) ||
      farms[0] ||
      null
    );
  }, [farms]);

  const featuredCycle = useMemo(() => {
    if (!featuredFarm) return null;
    return (
      cropCycles.find((c) => c.farmId === featuredFarm.id && (c.status === 'ACTIVE' || c.status === 'PLANNED')) ||
      cropCycles.find((c) => c.farmId === featuredFarm.id) ||
      null
    );
  }, [cropCycles, featuredFarm]);

  const tasks = useMemo(() => {
    const rows: { id: string; name: string; assignedTo: string; dueDate: string; status: string }[] = [];

    for (const farmer of farmers) {
      if (farmer.verificationStatus && farmer.verificationStatus !== 'VERIFIED') {
        const officer = farmer.assignedOfficer
          ? `${farmer.assignedOfficer.firstName || ''} ${farmer.assignedOfficer.lastName || ''}`.trim()
          : 'Unassigned';
        rows.push({
          id: `farmer-${farmer.id}`,
          name: `Verify farmer ${farmer.firstName || ''} ${farmer.lastName || ''}`.trim(),
          assignedTo: officer || 'Field Officer',
          dueDate: farmer.updatedAt ? new Date(farmer.updatedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' }) : '—',
          status: 'Pending',
        });
      }
      if (rows.length >= 6) break;
    }

    for (const farm of farms) {
      if (rows.length >= 6) break;
      if (!farm.isVerified) {
        rows.push({
          id: `farm-${farm.id}`,
          name: `Verify farm ${farm.farmCode || farm.name || farm.id.slice(0, 8)}`,
          assignedTo: 'Field Officer',
          dueDate: farm.updatedAt ? new Date(farm.updatedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' }) : '—',
          status: 'Pending',
        });
      }
    }

    for (const visit of officerVisits.slice(0, 4)) {
      if (rows.length >= 8) break;
      const officer = visit.fieldOfficer
        ? `${visit.fieldOfficer.firstName || ''} ${visit.fieldOfficer.lastName || ''}`.trim()
        : 'Field Officer';
      rows.push({
        id: `visit-${visit.id}`,
        name: visit.purpose || visit.notes || 'Field visit follow-up',
        assignedTo: officer || 'Field Officer',
        dueDate: visit.visitedAt
          ? new Date(visit.visitedAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' })
          : '—',
        status: visit.status === 'COMPLETED' ? 'Completed' : 'In Progress',
      });
    }

    return rows.slice(0, 5);
  }, [farmers, farms, officerVisits]);

  const harvestSummary = useMemo(() => {
    const totals = inventoryRecords.reduce<Record<string, number>>((acc, record) => {
      const label = record.riceVariety || record.qualityGrade || record.commodity || 'Rice';
      acc[label] = (acc[label] || 0) + (record.weightKg || 0);
      return acc;
    }, {});
    const fromInventory = Object.entries(totals)
      .map(([name, kg]) => ({ name, tons: Math.round(kg / 1000) || Math.round(kg) / 1000 }))
      .sort((a, b) => b.tons - a.tons)
      .slice(0, 5);

    if (fromInventory.length) return fromInventory;

    return productionByVariety.slice(0, 5).map((row) => ({
      name: row.name,
      tons: Math.round(row.value / 1000) || Math.round(row.value) / 1000,
    }));
  }, [inventoryRecords, productionByVariety]);

  const today = new Date();
  const greeting = greetingForHour(today.getHours());
  const forecastDay = weather?.days?.[0];
  const tempC = forecastDay?.maxTempC ?? 24;
  const lowC = forecastDay?.minTempC ?? tempC - 4;
  const highC = forecastDay?.maxTempC ?? tempC;
  const displayTemp = unit === 'C' ? Math.round(tempC) : Math.round((tempC * 9) / 5 + 32);
  const displayHigh = unit === 'C' ? Math.round(highC) : Math.round((highC * 9) / 5 + 32);
  const displayLow = unit === 'C' ? Math.round(lowC) : Math.round((lowC * 9) / 5 + 32);
  const feelsLike = unit === 'C' ? Math.round(tempC + 2) : Math.round(((tempC + 2) * 9) / 5 + 32);
  const precip = forecastDay?.precipitationMm ?? 0;
  const condition = precip > 5 ? 'Rainy' : precip > 0.5 ? 'Cloudy' : 'Sunny';

  const verifiedFarms = farms.filter((f) => f.isVerified).length;
  const landDeltaPct = farms.length
    ? ((verifiedFarms / farms.length) * 100).toFixed(2)
    : '0.00';
  const farmersDeltaPct = farmers.length
    ? (((farmers.filter((f) => f.verificationStatus === 'VERIFIED').length / farmers.length) * 100)).toFixed(2)
    : '0.00';

  const peakYieldPoint = useMemo(() => {
    if (!yieldTrend.length) return null;
    const best = yieldTrend.reduce((b, row) => (row.yield > b.yield ? row : b), yieldTrend[0]);
    const index = yieldTrend.indexOf(best);
    return {
      ...best,
      align: index === 0 ? 'start' : index === yieldTrend.length - 1 ? 'end' : 'center',
    } as typeof best & { align: 'start' | 'end' | 'center' };
  }, [yieldTrend]);

  const enter = reduce
    ? undefined
    : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="fv-dashboard">
      {error && <EmptyState>{error}</EmptyState>}

      <motion.div
        className="fv-hero"
        {...(enter || {})}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <div>
          <h1 className="fv-greeting">{greeting}</h1>
          <p className="fv-hero-sub">
            Optimize your cooperative operations with real-time MAYOData insights
            {user?.firstName ? `, ${user.firstName}` : ''}.
          </p>
        </div>
        <div className="fv-hero-actions">
          <label className="fv-period">
            <HugeiconsIcon icon={Calendar01Icon} size={14} strokeWidth={1.8} />
            <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
              <option>This Month</option>
              <option>This Season</option>
              <option>This Year</option>
            </select>
          </label>
          <Link href="/dashboard/reports" className="fv-export-btn">
            <HugeiconsIcon icon={Upload04Icon} size={14} strokeWidth={1.8} />
            Export
          </Link>
        </div>
      </motion.div>

      <div className="fv-row fv-row-top">
        <motion.article
          className="fv-card fv-weather"
          {...(enter || {})}
          transition={{ duration: 0.45, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="fv-weather-top">
            <span className="fv-location-pill">{WEATHER_HOME.label}</span>
            <div className="fv-unit-toggle" role="group" aria-label="Temperature unit">
              <button type="button" className={unit === 'C' ? 'is-active' : ''} onClick={() => setUnit('C')}>C</button>
              <button type="button" className={unit === 'F' ? 'is-active' : ''} onClick={() => setUnit('F')}>F</button>
            </div>
          </div>
          <p className="fv-weather-date">{formatLongDate(today)}</p>
          <div className="fv-weather-body">
            <div>
              <div className="fv-temp">
                {loading ? '—' : <CountUpValue value={displayTemp} />}
                <span>° {unit}</span>
              </div>
              <div className="fv-temp-range">
                <span>H: {loading ? '—' : displayHigh}°</span>
                <span>L: {loading ? '—' : displayLow}°</span>
              </div>
            </div>
            <div className="fv-weather-aside">
              <span className="fv-weather-icon" aria-hidden>
                <WeatherGlyph condition={condition} size={46} />
              </span>
              <strong>{condition}</strong>
              <small>Feels Like {loading ? '—' : feelsLike}</small>
            </div>
          </div>
        </motion.article>

        <div className="fv-top-aside">
          <motion.article
            className="fv-card fv-production"
            {...(enter || {})}
            transition={{ duration: 0.45, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="fv-card-head">
              <h2>Production Overview</h2>
              <span className="fv-chip">
                Yearly
                <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={2.4} />
              </span>
            </div>
            <div className="fv-production-body">
              <div className="fv-donut-wrap">
                {loading ? (
                  <div className="fv-chart-empty">Loading…</div>
                ) : !productionLegend.some((r) => r.value > 0) ? (
                  <div className="fv-chart-empty">No production yet</div>
                ) : (
                  <>
                    <svg viewBox="0 0 200 112" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" className="fv-ray-chart">
                      {productionRays.map((ray, i) => (
                        <line
                          key={i}
                          x1={ray.x1}
                          y1={ray.y1}
                          x2={ray.x2}
                          y2={ray.y2}
                          stroke={ray.color}
                          strokeWidth={7}
                          strokeLinecap="round"
                        />
                      ))}
                    </svg>
                    <div className="fv-donut-center">
                      <strong className="fv-prod-total" style={{ fontSize: '0.95rem' }}>
                        {totalProductionTons.toLocaleString()} tons
                      </strong>
                      <small>Total Production</small>
                    </div>
                  </>
                )}
              </div>
              <ul className="fv-prod-legend">
                {productionLegend.map((row) => (
                  <li key={row.name}>
                    <span className="fv-legend-dot" style={{ background: row.color }} />
                    <span>
                      {row.name}: <em>{row.pct}%</em>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.article>

          <div className="fv-metric-stack">
            <motion.article
              className="fv-card fv-metric"
              {...(enter || {})}
              transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <div>
                <span className="fv-metric-label">Total Land Area</span>
                <strong className="fv-metric-value">
                  {loading ? '—' : <CountUpValue value={`${totalLandHa.toLocaleString()} ha`} />}
                </strong>
                <small className="fv-metric-delta is-up">+{landDeltaPct}% farms verified</small>
              </div>
              <span className="fv-metric-icon is-green" aria-hidden>
                <HugeiconsIcon icon={Globe02Icon} size={18} strokeWidth={1.8} />
              </span>
            </motion.article>

            <motion.article
              className="fv-card fv-metric"
              {...(enter || {})}
              transition={{ duration: 0.45, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
            >
              <div>
                <span className="fv-metric-label">Revenue</span>
                <strong className="fv-metric-value">
                  {loading ? '—' : <CountUpValue value={money(revenue)} />}
                </strong>
                <small className="fv-metric-delta is-purple">+{farmersDeltaPct}% farmers verified</small>
              </div>
              <span className="fv-metric-icon is-purple" aria-hidden>
                <HugeiconsIcon icon={ChartBarLineIcon} size={18} strokeWidth={1.8} />
              </span>
            </motion.article>
          </div>
        </div>
      </div>

      <div className="fv-row fv-row-mid">
        <motion.article
          className="fv-card fv-yield"
          {...(enter || {})}
          transition={{ duration: 0.5, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="fv-card-head">
            <h2>Monthly Yield Analysis</h2>
            <div className="fv-filters">
              <span className="fv-chip">Rice</span>
              <span className="fv-chip">{today.getFullYear()}</span>
            </div>
          </div>
          {loading || !yieldTrend.length ? (
            <div className="fv-chart-empty">{loading ? 'Loading yield trend…' : 'No yield records yet.'}</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={yieldTrend} margin={{ top: 46, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="fvYieldFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--green-500)" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="var(--green-500)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="4 6" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: 'var(--text-3)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-3)', fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`${value}T`, 'Yield']}
                  labelFormatter={(label) => String(label)}
                />
                {peakYieldPoint && (
                  <ReferenceDot
                    x={peakYieldPoint.month}
                    y={peakYieldPoint.yield}
                    r={0}
                    isFront
                    ifOverflow="visible"
                    label={(props: any) => {
                      const vb = props?.viewBox ?? {};
                      const cx = props?.cx ?? vb.cx ?? vb.x ?? 0;
                      const cy = props?.cy ?? vb.cy ?? vb.y ?? 0;
                      const boxX =
                        peakYieldPoint.align === 'start'
                          ? cx + 4
                          : peakYieldPoint.align === 'end'
                            ? cx - 68
                            : cx - 32;
                      return (
                        <g>
                          <line x1={cx} y1={cy} x2={cx} y2={cy + 60} stroke="var(--green-500)" strokeDasharray="3 4" strokeWidth={1.5} />
                          <foreignObject x={boxX} y={cy - 44} width={64} height={40}>
                            <div className="fv-yield-badge">
                              <span>Yield</span>
                              <strong>{peakYieldPoint.yield}T</strong>
                            </div>
                          </foreignObject>
                        </g>
                      );
                    }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="yield"
                  stroke="var(--green-500)"
                  strokeWidth={3}
                  fill="url(#fvYieldFill)"
                  dot={{ r: 5, fill: 'var(--green-500)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
                  activeDot={{ r: 7, fill: 'var(--green-600)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.article>

        <motion.article
          className="fv-card fv-field"
          {...(enter || {})}
          transition={{ duration: 0.5, delay: 0.16, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="fv-field-media" style={{ backgroundImage: 'url(/login-rice-field.png)' }}>
            <div className="fv-field-overlay">
              <div className="fv-field-overlay-top">
                <span className="fv-chip fv-chip-solid">
                  {featuredFarm?.farmCode || featuredFarm?.name || 'Rice Field'}
                </span>
                <Link href={featuredFarm ? `/dashboard/farms/${featuredFarm.id}` : '/dashboard/farms'} className="fv-pill-btn">
                  More Details
                  <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} />
                </Link>
              </div>
              <div className="fv-field-stats">
                <div>
                  <span>Crop Health</span>
                  <strong>{featuredFarm?.isVerified ? 'Good' : 'Review'}</strong>
                </div>
                <div>
                  <span>Planting Date</span>
                  <strong>
                    {featuredCycle?.plantingDate
                      ? new Date(featuredCycle.plantingDate).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
                      : '—'}
                  </strong>
                </div>
                <div>
                  <span>Harvest Window</span>
                  <strong>{featuredCycle?.status?.replace(/_/g, ' ') || 'Season TBD'}</strong>
                </div>
              </div>
            </div>
          </div>
        </motion.article>
      </div>

      <div className="fv-row fv-row-bottom">
        <motion.article
          className="fv-card fv-tasks"
          {...(enter || {})}
          transition={{ duration: 0.5, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="fv-card-head">
            <h2>Task Management</h2>
            <div className="fv-task-actions">
              <Link href="/dashboard/field-surveys" className="fv-pill-btn">
                View All
                <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} />
              </Link>
            </div>
          </div>
          <div className="fv-table-wrap">
            <table className="fv-table">
              <thead>
                <tr>
                  <th>Task Name</th>
                  <th>Assigned To</th>
                  <th>Due Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4}>Loading tasks…</td></tr>
                ) : tasks.length === 0 ? (
                  <tr><td colSpan={4}>No open tasks right now.</td></tr>
                ) : (
                  tasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.name}</td>
                      <td>{task.assignedTo}</td>
                      <td>{task.dueDate}</td>
                      <td><span className={`badge ${statusBadge(task.status)}`}>{task.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.article>

        <motion.article
          className="fv-card fv-harvest"
          {...(enter || {})}
          transition={{ duration: 0.5, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="fv-card-head">
            <h2>Harvest Summary</h2>
          </div>
          <ul className="fv-harvest-list">
            {loading ? (
              <li className="fv-harvest-empty">Loading harvest…</li>
            ) : harvestSummary.length === 0 ? (
              <li className="fv-harvest-empty">No harvest records yet.</li>
            ) : (
              harvestSummary.map((row, idx) => (
                <li key={row.name}>
                  <span className={`fv-harvest-icon tone-${idx % 3}`} aria-hidden>
                    <HugeiconsIcon
                      icon={idx % 3 === 0 ? WheatIcon : idx % 3 === 1 ? Plant01Icon : MapsIcon}
                      size={16}
                      strokeWidth={1.8}
                    />
                  </span>
                  <span className="fv-harvest-name">{row.name}</span>
                  <strong>{row.tons.toLocaleString()} tons</strong>
                </li>
              ))
            )}
          </ul>
        </motion.article>
      </div>
    </div>
  );
}
