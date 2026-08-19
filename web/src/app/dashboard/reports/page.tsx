'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  UserGroupIcon,
  MapsSearchIcon,
  WheatIcon,
  ShoppingCart02Icon,
  Wallet01Icon,
  HandshakeIcon,
  Package01Icon,
  CheckmarkBadge02Icon,
  File01Icon,
  Delete02Icon,
  ArrowRight01Icon,
  ChevronDownIcon,
  ChartBarLineIcon,
  Search01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import { reportsApi } from '@/lib/api';
import Modal from '@/components/Modal';
import ReportPreviewTable, { type ReportColumn } from '@/components/reports/ReportPreviewTable';

// ── Types ──
interface BuilderRelation {
  key: string;
  label: string;
  /** true = one-to-many: rows expand to one per related record. */
  many: boolean;
}
interface BuilderEntity {
  key: string;
  label: string;
  noun: string;
  description: string;
  category?: string;
  columns: ReportColumn[];
  relations: BuilderRelation[];
}
interface BuilderPreview {
  name: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  total: number;
  grain?: string;
}
interface Filters {
  from: string; to: string; region: string; district: string; ward: string; village: string;
  mamcosId: string; fieldOfficerId: string; season: string; riceVariety: string; gender: string; youthOnly: boolean;
}
interface ReportConfig {
  entity: string;
  /** Column keys; joined columns are namespaced as "entity.column". */
  columns: string[];
  joins?: string[];
  filters?: Filters;
}
interface SavedTemplate extends ReportConfig {
  name: string;
  filters: Filters;
  savedAt: string;
}

type ExportFormat = 'csv' | 'xlsx' | 'pdf';
type Tab = 'builder' | 'templates';

// ── Static config ──
const EMPTY_FILTERS: Filters = {
  from: '', to: '', region: '', district: '', ward: '', village: '',
  mamcosId: '', fieldOfficerId: '', season: '', riceVariety: '', gender: '', youthOnly: false,
};

const CATEGORY_LABELS: Record<string, string> = {
  people: 'People & cooperatives',
  field: 'Field & production',
  leases: 'Leases & seasons',
  commerce: 'Sales & supply',
  finance: 'Finance & accounting',
  insurance: 'Insurance',
  marketplace: 'Marketplace',
  membership: 'Memberships',
  governance: 'Governance & rewards',
  alerts: 'Alerts',
  facilities: 'Facilities',
  compliance: 'Compliance',
};

const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

const ENTITY_ICONS: Record<string, IconSvgElement> = {
  farmers: UserGroupIcon,
  farms: MapsSearchIcon,
  'crop-cycles': WheatIcon,
  sales: ShoppingCart02Icon,
  payments: Wallet01Icon,
  loans: HandshakeIcon,
  inventory: Package01Icon,
  memberships: CheckmarkBadge02Icon,
};

// Columns pre-ticked when an entity is first selected.
const DEFAULT_COLUMNS: Record<string, string[]> = {
  farmers: ['controlNumber', 'firstName', 'lastName', 'phone', 'village', 'district', 'cooperative', 'verificationStatus'],
  farms: ['farmCode', 'name', 'owner', 'village', 'socialHectares', 'grade', 'isVerified'],
  'crop-cycles': ['farmCode', 'farmer', 'season', 'riceVariety', 'plantingDate', 'harvestDate', 'actualYieldKg', 'status'],
  sales: ['invoiceNumber', 'saleDate', 'buyer', 'quantityKg', 'pricePerKg', 'totalRevenue', 'paymentReceived'],
  payments: ['farmer', 'amount', 'loanDeduction', 'netAmount', 'paymentType', 'status', 'paidAt'],
  loans: ['farmer', 'lenderName', 'originalAmount', 'amountOwed', 'isActive'],
  inventory: ['trackingCode', 'lotNumber', 'farmCode', 'farmer', 'weightKg', 'qualityGrade', 'receivedDate', 'status'],
  memberships: ['farmer', 'plan', 'season', 'status', 'paymentStatus', 'amountTzs', 'startDate', 'endDate'],
};

// Bare column keys pre-ticked when a related entity is joined in.
const DEFAULT_JOIN_COLUMNS: Record<string, string[]> = {
  farmers: ['firstName', 'lastName', 'phone', 'village'],
  farms: ['farmCode', 'name', 'village', 'socialHectares'],
  'crop-cycles': ['season', 'riceVariety', 'actualYieldKg', 'status'],
  sales: ['invoiceNumber', 'saleDate', 'totalRevenue'],
  payments: ['amount', 'netAmount', 'status', 'paidAt'],
  loans: ['lenderName', 'originalAmount', 'amountOwed'],
  inventory: ['trackingCode', 'weightKg', 'receivedDate'],
  memberships: ['plan', 'status', 'paymentStatus'],
};

interface TemplatePreset extends ReportConfig { name: string; blurb: string }
const TEMPLATE_PRESETS: TemplatePreset[] = [
  { name: 'Farmer directory', entity: 'farmers', blurb: 'Full contact and verification listing per farmer.', columns: DEFAULT_COLUMNS.farmers },
  { name: 'Verified farms register', entity: 'farms', blurb: 'Boundary-approved farms with size and grade.', columns: ['farmCode', 'name', 'owner', 'village', 'district', 'socialHectares', 'actualAcres', 'grade', 'hasIrrigation', 'isVerified'] },
  { name: 'Season production', entity: 'crop-cycles', blurb: 'Per-cycle yields for the season’s production report.', columns: DEFAULT_COLUMNS['crop-cycles'] },
  {
    name: 'Production with farm & grower', entity: 'crop-cycles', joins: ['farms', 'farmers'],
    blurb: 'Yields per cycle, enriched with farm size and grower contact.',
    columns: [...DEFAULT_COLUMNS['crop-cycles'], 'farms.socialHectares', 'farms.grade', 'farmers.phone', 'farmers.village'],
  },
  {
    name: 'Grower register with farms', entity: 'farmers', joins: ['farms'],
    blurb: 'One row per farm, with the owning farmer’s contact details repeated.',
    columns: ['controlNumber', 'firstName', 'lastName', 'phone', 'district', 'farms.farmCode', 'farms.name', 'farms.socialHectares', 'farms.grade', 'farms.isVerified'],
  },
  { name: 'Sales register', entity: 'sales', blurb: 'Invoice-level sales with revenue and premium.', columns: DEFAULT_COLUMNS.sales },
  {
    name: 'Payout statement with contacts', entity: 'payments', joins: ['farmers'],
    blurb: 'Gross-to-net payout breakdown with farmer phone and village.',
    columns: [...DEFAULT_COLUMNS.payments, 'farmers.phone', 'farmers.village', 'farmers.district'],
  },
  { name: 'Farmer payout statement', entity: 'payments', blurb: 'Gross-to-net payout breakdown per farmer.', columns: DEFAULT_COLUMNS.payments },
  { name: 'Active loan book', entity: 'loans', blurb: 'Outstanding balances for lender reconciliation.', columns: DEFAULT_COLUMNS.loans },
  { name: 'Warehouse intake', entity: 'inventory', blurb: 'Intake weights, grades and traceability codes.', columns: DEFAULT_COLUMNS.inventory },
  { name: 'Membership roster', entity: 'memberships', blurb: 'Plan, season and payment status per member.', columns: DEFAULT_COLUMNS.memberships },
];

interface StandardReport { key: string; path: string; title: string; subtitle: string }
const STANDARD_REPORTS: StandardReport[] = [
  { key: 'farmer-payments', path: '/reports/farmer-payments', title: 'Farmer payments', subtitle: 'Aggregated revenue, loan deductions and net amounts per farmer.' },
  { key: 'premium-fund', path: '/reports/premium-fund', title: 'Fairtrade premium fund', subtitle: 'Income/expense ledger with running balance.' },
  { key: 'field-officer-performance', path: '/reports/field-officer-performance', title: 'Field officer performance', subtitle: 'Visits, farms mapped, farmers verified per officer.' },
  { key: 'insurance-coverage', path: '/reports/insurance-coverage', title: 'Insurance coverage', subtitle: 'Policies and claims by status and product type.' },
  { key: 'gender-youth-inclusion', path: '/reports/gender-youth-inclusion', title: 'Gender & youth inclusion', subtitle: 'Farmer breakdown by gender and youth (≤35) status.' },
  { key: 'farmers', path: '/reports/farmers', title: 'Farmers (fixed format)', subtitle: 'Server-defined farmer directory export.' },
  { key: 'crop-cycles', path: '/reports/crop-cycles', title: 'Crop cycles (fixed format)', subtitle: 'Server-defined seasonal production export.' },
];

const TEMPLATES_KEY = 'mayode.reportTemplates.v1';
const FORMAT_LABELS: Record<ExportFormat, string> = { csv: 'CSV (.csv)', xlsx: 'Excel (.xlsx)', pdf: 'PDF (.pdf)' };

function loadSavedTemplates(): SavedTemplate[] {
  try {
    const raw = window.localStorage.getItem(TEMPLATES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedTemplate[]) : [];
  } catch {
    return [];
  }
}

function downloadBlob(data: BlobPart, filename: string) {
  const url = window.URL.createObjectURL(new Blob([data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

async function errorMessage(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { message?: string | string[] };
      const msg = Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message;
      if (msg) return msg;
    } catch { /* non-JSON blob */ }
  }
  const msg = (data as { message?: string | string[] } | undefined)?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? fallback);
}

const slugify = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';

const cleanFilters = (filters: Filters) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== false));

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('builder');
  const [schema, setSchema] = useState<BuilderEntity[]>([]);
  const [entityKey, setEntityKey] = useState('');
  const [joins, setJoins] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [preview, setPreview] = useState<BuilderPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedTemplates, setSavedTemplates] = useState<SavedTemplate[]>(() =>
    typeof window === 'undefined' ? [] : loadSavedTemplates(),
  );
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [standardPreview, setStandardPreview] = useState<{ title: string; rows: Record<string, unknown>[] } | null>(null);
  const [standardBusy, setStandardBusy] = useState<string | null>(null);
  const [datasetHealth, setDatasetHealth] = useState<{ key: string; ok: boolean; detail: string }[] | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    reportsApi.builderSchema()
      .then((res) => setSchema(res.data as BuilderEntity[]))
      .catch(() => setError('Could not load the report catalog.'));
  }, []);

  // Click-outside / Escape closes the export menu.
  useEffect(() => {
    if (!exportOpen) return;
    const onClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExportOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportOpen]);

  const entity = useMemo(() => schema.find((e) => e.key === entityKey) ?? null, [schema, entityKey]);
  const entityLabel = (key: string) => schema.find((e) => e.key === key)?.label ?? key;

  // Live preview: re-runs (debounced) whenever the selection changes.
  useEffect(() => {
    if (!entityKey || columns.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreviewing(true);
      reportsApi.runBuilder({ entity: entityKey, joins, columns, ...cleanFilters(filters), format: 'json' })
        .then((res) => {
          if (cancelled) return;
          setPreview(res.data as BuilderPreview);
          setError('');
        })
        .catch(async (err) => {
          if (!cancelled) setError(await errorMessage(err, 'Could not run this report.'));
        })
        .finally(() => { if (!cancelled) setPreviewing(false); });
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [entityKey, joins, columns, filters]);

  const selectEntity = (key: string) => {
    setEntityKey(key);
    setJoins([]);
    const fromSchema = schema.find((e) => e.key === key);
    setColumns(DEFAULT_COLUMNS[key] ?? fromSchema?.columns.slice(0, 8).map((c) => c.key) ?? []);
    setPreview(null);
    setError('');
    setNotice('');
  };

  const toggleJoin = (key: string) => {
    if (joins.includes(key)) {
      setJoins(joins.filter((j) => j !== key));
      setColumns((current) => current.filter((c) => !c.startsWith(`${key}.`)));
    } else {
      setJoins([...joins, key]);
      const fromSchema = schema.find((e) => e.key === key);
      const defaults =
        DEFAULT_JOIN_COLUMNS[key] ??
        fromSchema?.columns.slice(0, 4).map((c) => c.key) ??
        [];
      setColumns((current) => [
        ...current,
        ...defaults.map((c) => `${key}.${c}`),
      ]);
    }
    setPreview(null);
  };

  const toggleColumn = (key: string) =>
    setColumns((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );

  const exportConfig = async (format: ExportFormat, config: ReportConfig, name: string) => {
    setExportOpen(false);
    if (!config.entity || config.columns.length === 0) {
      setError('Choose a data set and at least one column.');
      return;
    }
    setExporting(format);
    setError('');
    try {
      const res = await reportsApi.downloadBuilder({
        ...config,
        ...cleanFilters(config.filters ?? EMPTY_FILTERS),
        format,
        name,
      });
      downloadBlob(res.data as BlobPart, `${slugify(name)}-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (err) {
      setError(await errorMessage(err, `Unable to export ${format.toUpperCase()}.`));
    } finally {
      setExporting(null);
    }
  };

  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name || !entityKey || columns.length === 0) return;
    const next = [{ name, entity: entityKey, joins, columns, filters, savedAt: new Date().toISOString() }, ...savedTemplates].slice(0, 24);
    setSavedTemplates(next);
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
    setSaveModalOpen(false);
    setTemplateName('');
    setNotice(`Template “${name}” saved.`);
  };

  const deleteTemplate = (name: string) => {
    const next = savedTemplates.filter((t) => t.name !== name);
    setSavedTemplates(next);
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(next));
  };

  const openTemplate = (t: ReportConfig) => {
    setEntityKey(t.entity);
    setJoins(t.joins ?? []);
    setColumns(t.columns);
    setFilters(t.filters ?? EMPTY_FILTERS);
    setPreview(null);
    setTab('builder');
  };

  const checkPhase1Datasets = async () => {
    setHealthBusy(true);
    setDatasetHealth(null);
    setError('');
    const keys = Object.keys(DEFAULT_COLUMNS);
    const results: { key: string; ok: boolean; detail: string }[] = [];
    for (const key of keys) {
      try {
        const res = await reportsApi.runBuilder({
          entity: key,
          joins: [],
          columns: DEFAULT_COLUMNS[key],
          format: 'json',
        });
        const total = (res.data as BuilderPreview)?.total ?? 0;
        results.push({ key, ok: true, detail: `${total} row(s)` });
      } catch (err) {
        results.push({ key, ok: false, detail: await errorMessage(err, 'Failed') });
      }
    }
    setDatasetHealth(results);
    setHealthBusy(false);
    const failed = results.filter((r) => !r.ok).length;
    setNotice(
      failed === 0
        ? `All ${results.length} Phase 1 datasets respond.`
        : `${failed} of ${results.length} datasets failed — see results below.`,
    );
  };

  const previewStandard = async (report: StandardReport) => {
    setStandardBusy(`preview:${report.key}`);
    setError('');
    try {
      // download() forces responseType blob even for JSON — re-parse the text.
      const res = await reportsApi.download(report.path, { ...cleanFilters(filters), format: 'json' });
      const parsed: unknown = JSON.parse(await (res.data as Blob).text());
      const rows = Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : [];
      setStandardPreview({ title: report.title, rows });
    } catch (err) {
      setError(await errorMessage(err, `Unable to preview ${report.title}.`));
    } finally {
      setStandardBusy(null);
    }
  };

  const exportStandard = async (report: StandardReport, format: ExportFormat) => {
    setStandardBusy(`${report.key}:${format}`);
    setError('');
    try {
      const res = await reportsApi.download(report.path, { ...cleanFilters(filters), format });
      downloadBlob(res.data as BlobPart, `${report.key}-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (err) {
      setError(await errorMessage(err, `Unable to download ${report.title}.`));
    } finally {
      setStandardBusy(null);
    }
  };

  const setFilter = (key: keyof Filters, value: string | boolean) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const activeFilterCount = Object.values(filters).filter((v) => v !== '' && v !== false).length;
  const iconFor = (key: string) => ENTITY_ICONS[key] ?? File01Icon;

  return (
    <div className="page-shell">
      {error && <div className="alert-box alert-danger" style={{ marginBottom: 16 }}>{error}</div>}
      {notice && <div className="alert-box alert-success" style={{ marginBottom: 16 }}>{notice}</div>}

      <div className="seg-control" style={{ marginBottom: 12 }}>
        {(['builder', 'templates'] as Tab[]).map((t) => (
          <button key={t} className={`seg-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {tab === t && <motion.span layoutId="seg-pill" className="seg-pill" transition={{ type: 'spring', bounce: 0.18, duration: 0.45 }} />}
            {t === 'builder' ? 'Report builder' : `Templates${savedTemplates.length ? ` · ${savedTemplates.length} saved` : ''}`}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <button className="btn-secondary" style={{ fontSize: 12, padding: '7px 12px' }} onClick={checkPhase1Datasets} disabled={healthBusy}>
          {healthBusy ? 'Checking datasets…' : 'Check Phase 1 datasets'}
        </button>
        {datasetHealth && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {datasetHealth.map((row) => (
              <span key={row.key} className={`badge ${row.ok ? 'badge-green' : 'badge-red'}`} title={row.detail}>
                {row.key} · {row.ok ? row.detail : 'error'}
              </span>
            ))}
          </div>
        )}
      </div>

      {tab === 'builder' ? (
        <div className="builder-grid">
          {/* ── Configuration rail ── */}
          <aside className="glass-card builder-config">
            <div className="builder-section">
              <div className="builder-section-title">Data set</div>
              {!schema.length && !error ? (
                <div style={{ padding: '8px 2px', color: 'var(--text-3)', fontSize: 13 }}>Loading catalog…</div>
              ) : (
                <DatasetPicker
                  schema={schema}
                  value={entityKey}
                  onChange={selectEntity}
                  iconFor={iconFor}
                />
              )}
              {entity && (
                <p className="dataset-picker-hint">{entity.description}</p>
              )}
            </div>

            {entity && entity.relations.length > 0 && (
              <div className="builder-section">
                <div className="builder-section-title">Related data</div>
                <div className="entity-list">
                  {entity.relations.map((rel) => {
                    const on = joins.includes(rel.key);
                    const blocked =
                      !on &&
                      rel.many &&
                      joins.some((j) => entity.relations.find((r) => r.key === j)?.many);
                    return (
                      <div
                        key={rel.key}
                        role="checkbox"
                        aria-checked={on}
                        aria-disabled={blocked}
                        tabIndex={blocked ? -1 : 0}
                        className={`col-row ${on ? 'on' : ''}`}
                        style={blocked ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                        title={
                          blocked
                            ? 'Only one row-expanding relation per report'
                            : rel.many
                              ? `Expands the report to one row per ${rel.label.toLowerCase().replace(/s$/, '')}`
                              : `Adds ${rel.label.toLowerCase()} columns to each row`
                        }
                        onClick={() => !blocked && toggleJoin(rel.key)}
                        onKeyDown={(e) => { if (!blocked && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggleJoin(rel.key); } }}
                      >
                        <span className="col-box" />
                        <HugeiconsIcon icon={iconFor(rel.key)} size={15} color={on ? 'var(--accent)' : 'var(--text-3)'} strokeWidth={2} />
                        {rel.label}
                        <span className="entity-meta">{rel.many ? 'expands rows' : 'per row'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {entity && (
              <div className="builder-section">
                <div className="builder-section-title">
                  <span>Columns · <span style={{ color: 'var(--accent)' }}>{columns.length}</span></span>
                </div>
                <div className="col-list">
                  <div className="col-group-label">
                    <span>{entity.label}</span>
                    <span style={{ display: 'flex', gap: 10 }}>
                      <button className="builder-link" onClick={() => setColumns([...new Set([...columns, ...entity.columns.map((c) => c.key)])])}>All</button>
                      <button className="builder-link" onClick={() => setColumns(columns.filter((k) => k.includes('.')))}>None</button>
                    </span>
                  </div>
                  {entity.columns.map((c) => (
                    <div
                      key={c.key}
                      role="checkbox"
                      aria-checked={columns.includes(c.key)}
                      tabIndex={0}
                      className={`col-row ${columns.includes(c.key) ? 'on' : ''}`}
                      onClick={() => toggleColumn(c.key)}
                      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleColumn(c.key); } }}
                    >
                      <span className="col-box" />
                      {c.label}
                      <span className="col-type">{c.type ?? 'text'}</span>
                    </div>
                  ))}
                  {joins.map((joinKey) => {
                    const joined = schema.find((e) => e.key === joinKey);
                    if (!joined) return null;
                    const selected = columns.filter((k) => k.startsWith(`${joinKey}.`));
                    return (
                      <div key={joinKey}>
                        <div className="col-group-label">
                          <span>{joined.label} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>(joined)</span></span>
                          <span style={{ display: 'flex', gap: 10 }}>
                            <button className="builder-link" onClick={() => setColumns([...new Set([...columns, ...joined.columns.map((c) => `${joinKey}.${c.key}`)])])}>All</button>
                            <button className="builder-link" onClick={() => setColumns(columns.filter((k) => !k.startsWith(`${joinKey}.`)))}>None</button>
                          </span>
                        </div>
                        {joined.columns.map((c) => {
                          const nsKey = `${joinKey}.${c.key}`;
                          return (
                            <div
                              key={nsKey}
                              role="checkbox"
                              aria-checked={columns.includes(nsKey)}
                              tabIndex={0}
                              className={`col-row ${columns.includes(nsKey) ? 'on' : ''}`}
                              onClick={() => toggleColumn(nsKey)}
                              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleColumn(nsKey); } }}
                            >
                              <span className="col-box" />
                              {c.label}
                              <span className="col-type">{c.type ?? 'text'}</span>
                            </div>
                          );
                        })}
                        {selected.length === 0 && (
                          <div style={{ padding: '2px 10px 8px', fontSize: 11.5, color: 'var(--red-400, #f87171)' }}>
                            Tick at least one {joined.label.toLowerCase()} column or remove the join.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {entity && (
              <div className="builder-section" style={{ paddingBottom: filtersOpen ? 18 : 16 }}>
                <button className="filter-toggle" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
                  <span className="builder-section-title" style={{ margin: 0 }}>
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="badge badge-green" style={{ marginLeft: 8 }}>{activeFilterCount} active</span>
                    )}
                  </span>
                  <HugeiconsIcon
                    icon={ChevronDownIcon}
                    size={14}
                    color="var(--text-3)"
                    style={{ transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}
                  />
                </button>
                {filtersOpen && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px', marginTop: 14 }}>
                    <label className="form-label">From<input className="input-field" type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></label>
                    <label className="form-label">To<input className="input-field" type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></label>
                    <label className="form-label">Region<input className="input-field" value={filters.region} onChange={(e) => setFilter('region', e.target.value)} /></label>
                    <label className="form-label">District<input className="input-field" value={filters.district} onChange={(e) => setFilter('district', e.target.value)} /></label>
                    <label className="form-label">Ward<input className="input-field" value={filters.ward} onChange={(e) => setFilter('ward', e.target.value)} /></label>
                    <label className="form-label">Village<input className="input-field" value={filters.village} onChange={(e) => setFilter('village', e.target.value)} /></label>
                    <label className="form-label">AMCOS ID<input className="input-field" value={filters.mamcosId} onChange={(e) => setFilter('mamcosId', e.target.value)} /></label>
                    <label className="form-label">Officer ID<input className="input-field" value={filters.fieldOfficerId} onChange={(e) => setFilter('fieldOfficerId', e.target.value)} /></label>
                    {entityKey === 'crop-cycles' && (
                      <label className="form-label">Season<input className="input-field" value={filters.season} onChange={(e) => setFilter('season', e.target.value)} /></label>
                    )}
                    {(entityKey === 'crop-cycles' || entityKey === 'sales') && (
                      <label className="form-label">Rice variety<input className="input-field" value={filters.riceVariety} onChange={(e) => setFilter('riceVariety', e.target.value)} /></label>
                    )}
                    <label className="form-label">Gender
                      <select className="input-field" value={filters.gender} onChange={(e) => setFilter('gender', e.target.value)}>
                        <option value="">Any</option>
                        <option value="MALE">Male</option>
                        <option value="FEMALE">Female</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input type="checkbox" checked={filters.youthOnly} onChange={(e) => setFilter('youthOnly', e.target.checked)} /> Youth only (≤35)
                    </label>
                  </div>
                )}
              </div>
            )}
          </aside>

          {/* ── Preview canvas ── */}
          <section className="glass-card" style={{ overflow: 'hidden', minHeight: 480, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap',
              }}
            >
              {entity ? (
                <>
                  <span className="icon-chip"><HugeiconsIcon icon={iconFor(entity.key)} size={17} strokeWidth={2} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'Outfit, sans-serif', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {entity.label} report
                      {joins.map((j) => (
                        <span key={j} className="badge badge-blue" style={{ fontWeight: 600 }}>+ {entityLabel(j)}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                      {preview?.grain ?? `One row per ${entity.noun}`}
                      {' · '}{columns.length} columns
                      {preview && <> · {preview.rows.length.toLocaleString()}{preview.total > preview.rows.length ? ` of ${preview.total.toLocaleString()}` : ''} rows</>}
                      {previewing && preview && <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }}><span className="updating-dot" />Updating…</span>}
                    </div>
                  </div>
                  <button className="btn-secondary" style={{ fontSize: 12, padding: '7px 12px' }} onClick={() => setSaveModalOpen(true)} disabled={columns.length === 0}>
                    Save as template
                  </button>
                  <div ref={exportRef} style={{ position: 'relative' }}>
                    <button className="btn-primary" style={{ fontSize: 12, padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setExportOpen((o) => !o)} disabled={exporting !== null || columns.length === 0}>
                      <HugeiconsIcon icon={File01Icon} size={14} strokeWidth={2} />
                      {exporting ? `Exporting ${exporting.toUpperCase()}…` : 'Export'}
                      <HugeiconsIcon icon={ChevronDownIcon} size={12} strokeWidth={2} style={{ transform: exportOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                    </button>
                    {exportOpen && (
                      <div className="dropdown-menu" style={{ top: 'calc(100% + 8px)', right: 0, minWidth: 180 }}>
                        {(['csv', 'xlsx', 'pdf'] as ExportFormat[]).map((f) => (
                          <button key={f} className="dropdown-item" onClick={() => exportConfig(f, { entity: entityKey, joins, columns, filters }, `${entity.label} report`)}>
                            <HugeiconsIcon icon={File01Icon} size={15} strokeWidth={2} />
                            {FORMAT_LABELS[f]}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>Preview</div>
              )}
            </div>

            {!entity ? (
              <div className="builder-empty">
                <span className="icon-chip" style={{ width: 48, height: 48, borderRadius: 14 }}>
                  <HugeiconsIcon icon={ChartBarLineIcon} size={22} strokeWidth={1.8} />
                </span>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)', marginTop: 4 }}>Choose a data set to start</div>
                <div style={{ fontSize: 12.5, maxWidth: 340, lineHeight: 1.5 }}>
                  Search and pick a data set, optionally join related data, tick the columns you need — the preview updates as you work.
                </div>
              </div>
            ) : columns.length === 0 ? (
              <div className="builder-empty">
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>No columns selected</div>
                <div style={{ fontSize: 12.5 }}>Tick at least one column to preview the report.</div>
              </div>
            ) : !preview ? (
              <div style={{ padding: 16 }}>
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 34, borderRadius: 8, marginBottom: 8, opacity: 1 - i * 0.1 }} />
                ))}
              </div>
            ) : (
              <ReportPreviewTable columns={preview.columns} rows={preview.rows} total={preview.total} />
            )}
          </section>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {savedTemplates.length > 0 && (
            <section>
              <div className="builder-section-title" style={{ margin: '0 0 12px' }}>My templates</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {savedTemplates.map((t) => (
                  <div key={t.name} className="glass-card template-card">
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <span className="icon-chip"><HugeiconsIcon icon={iconFor(t.entity)} size={17} strokeWidth={2} /></span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'Outfit, sans-serif' }}>{t.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                          {[entityLabel(t.entity), ...(t.joins ?? []).map((j) => entityLabel(j))].join(' + ')} · {t.columns.length} columns · {new Date(t.savedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      <button className="icon-btn" title="Delete template" onClick={() => deleteTemplate(t.name)}>
                        <HugeiconsIcon icon={Delete02Icon} size={15} color="var(--red-400)" strokeWidth={2} />
                      </button>
                    </div>
                    <div className="template-card-actions">
                      <button className="btn-primary" style={{ fontSize: 12, padding: '7px 12px' }} onClick={() => openTemplate(t)}>
                        Open in builder <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} style={{ marginLeft: 4 }} />
                      </button>
                      <span style={{ flex: 1 }} />
                      {(['csv', 'xlsx', 'pdf'] as ExportFormat[]).map((f) => (
                        <button key={f} className="btn-secondary" style={{ fontSize: 11, padding: '6px 10px' }} disabled={exporting !== null} onClick={() => exportConfig(f, t, t.name)}>
                          {exporting === f ? '…' : f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="builder-section-title" style={{ margin: '0 0 12px' }}>Report templates</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {TEMPLATE_PRESETS.map((t, i) => (
                <motion.div
                  key={t.name}
                  className="glass-card template-card"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.04 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="icon-chip"><HugeiconsIcon icon={iconFor(t.entity)} size={17} strokeWidth={2} /></span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', fontFamily: 'Outfit, sans-serif' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                        {[entityLabel(t.entity), ...(t.joins ?? []).map((j) => entityLabel(j))].join(' + ')}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.5, minHeight: 36 }}>{t.blurb}</div>
                  <div className="template-card-actions">
                    <button className="btn-primary" style={{ fontSize: 12, padding: '7px 12px' }} onClick={() => openTemplate(t)}>
                      Open in builder <HugeiconsIcon icon={ArrowRight01Icon} size={12} strokeWidth={2} style={{ marginLeft: 4 }} />
                    </button>
                    <span style={{ flex: 1 }} />
                    {(['csv', 'xlsx', 'pdf'] as ExportFormat[]).map((f) => (
                      <button key={f} className="btn-secondary" style={{ fontSize: 11, padding: '6px 10px' }} disabled={exporting !== null} onClick={() => exportConfig(f, t, t.name)}>
                        {exporting === f ? '…' : f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          <section>
            <div className="builder-section-title" style={{ margin: '0 0 4px' }}>Standard reports</div>
            <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
              Fixed audit-grade reports computed on the server — the builder’s filters also apply to these exports.
            </p>
            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              {STANDARD_REPORTS.map((report, i) => (
                <div
                  key={report.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                    padding: '14px 18px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{report.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{report.subtitle}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: '6px 10px' }} disabled={standardBusy !== null} onClick={() => previewStandard(report)}>
                      {standardBusy === `preview:${report.key}` ? 'Loading…' : 'Preview'}
                    </button>
                    {(['csv', 'xlsx', 'pdf'] as ExportFormat[]).map((f) => (
                      <button key={f} className="btn-secondary" style={{ fontSize: 11, padding: '6px 10px' }} disabled={standardBusy !== null} onClick={() => exportStandard(report, f)}>
                        {standardBusy === `${report.key}:${f}` ? '…' : f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {saveModalOpen && (
        <Modal
          title="Save as template"
          subtitle={`${[entity?.label ?? '', ...joins.map((j) => entityLabel(j))].join(' + ')} · ${columns.length} columns · current filters included`}
          onClose={() => setSaveModalOpen(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setSaveModalOpen(false)}>Cancel</button>
              <button className="btn-primary" onClick={saveTemplate} disabled={!templateName.trim()}>Save template</button>
            </>
          }
        >
          <label className="form-label">Template name</label>
          <input
            className="input-field"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Mbarali verified farmers"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') saveTemplate(); }}
          />
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
            Templates are stored in this browser and reopen in the builder with the same data set, columns and filters.
          </p>
        </Modal>
      )}

      {standardPreview && (
        <Modal
          title={standardPreview.title}
          subtitle={`${standardPreview.rows.length.toLocaleString()} rows`}
          onClose={() => setStandardPreview(null)}
          width="960px"
          footer={<button className="btn-primary" onClick={() => setStandardPreview(null)}>Close</button>}
        >
          <StandardPreviewBody rows={standardPreview.rows} />
        </Modal>
      )}
    </div>
  );
}

function StandardPreviewBody({ rows }: { rows: Record<string, unknown>[] }) {
  const columns: ReportColumn[] = rows.length
    ? Object.keys(rows[0]).map((key) => ({ key, label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()) }))
    : [];
  return <ReportPreviewTable columns={columns} rows={rows.slice(0, 200)} total={rows.length} />;
}

function DatasetPicker({
  schema,
  value,
  onChange,
  iconFor,
}: {
  schema: BuilderEntity[];
  value: string;
  onChange: (key: string) => void;
  iconFor: (key: string) => IconSvgElement;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = schema.find((e) => e.key === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? schema.filter((e) =>
          e.label.toLowerCase().includes(q) ||
          e.key.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          (e.category ?? '').toLowerCase().includes(q) ||
          (CATEGORY_LABELS[e.category ?? ''] ?? '').toLowerCase().includes(q),
        )
      : schema;

    const groups = new Map<string, BuilderEntity[]>();
    for (const e of list) {
      const cat = e.category && CATEGORY_LABELS[e.category] ? e.category : 'other';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(e);
    }
    const ordered = [
      ...CATEGORY_ORDER.filter((c) => groups.has(c)),
      ...[...groups.keys()].filter((c) => !CATEGORY_ORDER.includes(c)),
    ];
    return ordered.map((cat) => ({
      cat,
      label: CATEGORY_LABELS[cat] ?? 'Other',
      items: groups.get(cat)!,
    }));
  }, [schema, query]);

  const pick = (key: string) => {
    onChange(key);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className={`dataset-picker ${open ? 'is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`dataset-picker-trigger ${open ? 'open' : ''} ${selected ? 'has-value' : ''}`}
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            if (next) setQuery('');
            return next;
          });
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <HugeiconsIcon icon={iconFor(selected.key)} size={15} color="var(--accent)" strokeWidth={2} />
            <span className="dataset-picker-value">
              <strong>{selected.label}</strong>
              <small>{selected.columns.length} columns{selected.category ? ` · ${CATEGORY_LABELS[selected.category] ?? selected.category}` : ''}</small>
            </span>
          </>
        ) : (
          <>
            <HugeiconsIcon icon={Search01Icon} size={15} color="var(--text-3)" strokeWidth={2} />
            <span className="dataset-picker-placeholder">Search data sets…</span>
          </>
        )}
        <HugeiconsIcon icon={ChevronDownIcon} size={14} color="var(--text-3)" strokeWidth={2} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s ease' }} />
      </button>

      {open && (
        <div className="dataset-picker-panel" role="listbox">
          <div className="dataset-picker-search">
            <HugeiconsIcon icon={Search01Icon} size={14} color="var(--text-3)" strokeWidth={2} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter data sets…"
              aria-label="Search data sets"
            />
            {query && (
              <button type="button" className="dataset-picker-clear" onClick={() => setQuery('')} aria-label="Clear search">
                <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
              </button>
            )}
          </div>
          <div className="dataset-picker-list">
            {filtered.length === 0 ? (
              <div className="dataset-picker-empty">No data sets match “{query}”</div>
            ) : (
              filtered.map((group) => (
                <div key={group.cat} className="dataset-picker-group">
                  <div className="dataset-picker-group-label">{group.label}</div>
                  {group.items.map((e) => {
                    const active = e.key === value;
                    return (
                      <button
                        key={e.key}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`dataset-picker-option ${active ? 'active' : ''}`}
                        onClick={() => pick(e.key)}
                        title={e.description}
                      >
                        <HugeiconsIcon icon={iconFor(e.key)} size={15} color={active ? 'var(--accent)' : 'var(--text-3)'} strokeWidth={2} />
                        <span className="dataset-picker-option-text">
                          <strong>{e.label}</strong>
                          <small>{e.description}</small>
                        </span>
                        <span className="entity-meta">{e.columns.length}</span>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
