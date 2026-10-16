import { hasTranslation, type Language, type TranslationKey } from '../i18n';

type Translate = (key: TranslationKey, vars?: Record<string, string | number | null | undefined>) => string;

export type ActivityLike = {
  type?: string | null;
  title?: string | null;
  subtitle?: string | null;
  params?: Record<string, unknown> | null;
};

/** Existing labels for the farm activity types, shared with the "log activity" form. */
const ACTIVITY_LABEL_KEYS: Record<string, TranslationKey> = {
  LAND_PREPARATION: 'activityLandPreparation',
  PLANTING: 'activityPlanting',
  FERTILIZING: 'activityFertilizing',
  WEEDING: 'activityWeeding',
  PEST_CONTROL: 'activityPestControl',
  SEED_SELECTION: 'activitySeedSelection',
  NURSERY_ESTABLISHMENT: 'activityNurseryEstablishment',
  FIELD_INSPECTION: 'activityFieldInspection',
  IRRIGATION: 'activityIrrigation',
  HARVESTING: 'activityHarvesting',
  DRYING: 'activityDrying',
  STORAGE: 'activityStorage',
  TRANSPORT: 'activityTransport',
};

const slug = (type: string) => type.replace(/\./g, '_');

function formatNumber(value: unknown, language: Language): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  try {
    return n.toLocaleString(language === 'sw' ? 'sw-TZ' : 'en-US');
  } catch {
    return String(n);
  }
}

function enumLabel(prefix: string, value: unknown, t: Translate, lowerFallback = true): string {
  const raw = String(value ?? '');
  const key = `${prefix}${raw}`;
  if (raw && hasTranslation(key)) return t(key as TranslationKey);
  return lowerFallback ? raw.replace(/_/g, ' ').toLowerCase() : raw;
}

/** Drop the empty pieces of "a · b · c" when a fact was not recorded. */
function tidy(text: string): string {
  return text
    .split(' · ')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ');
}

const num = (s: string) => Number(s.replace(/,/g, ''));

/**
 * Activities saved before facts were stored hold a finished English sentence. The server always wrote
 * them from the same templates, so the facts can be read back out of that sentence.
 */
export function legacyParams(item: ActivityLike): Record<string, unknown> | null {
  const title = (item.title ?? '').trim();
  const sub = (item.subtitle ?? '').trim();
  let m: RegExpExecArray | null;
  switch (item.type) {
    case 'farm.created':
      return (m = /^Registered farm (.+)$/.exec(title)) ? { farmCode: m[1], place: sub === 'New farm' ? '' : sub } : null;
    case 'farm.mapped':
      return (m = /^Mapped (.+) boundary$/.exec(title)) ? { farmCode: m[1] } : null;
    case 'plot.created':
      return (m = /^Added plot (.+)$/.exec(title)) ? { plotCode: m[1], farmCode: sub.replace(/^on /, '') } : null;
    case 'plot.mapped':
      return (m = /^Mapped (.+) boundary$/.exec(title)) ? { plotCode: m[1] } : null;
    case 'document.added':
      return (m = /^Uploaded (.+)$/.exec(title))
        ? { docType: m[1].trim().toUpperCase().replace(/\s+/g, '_'), fileName: sub === 'File attached' ? '' : sub }
        : null;
    case 'crop_cycle.started': {
      if (!(m = /^Started crop cycle: (.+)$/.exec(title))) return null;
      const [farmCode, variety] = sub.split(' · ');
      return { season: m[1], farmCode: farmCode ?? '', variety: variety ?? '' };
    }
    case 'crop_cycle.status':
      return (m = /^(.+) is now (\w+)$/.exec(title)) ? { season: m[1], status: m[2].toUpperCase(), farmCode: sub } : null;
    case 'crop_cycle.activity': {
      if (!(m = /^Logged (.+)$/.exec(title))) return null;
      const [farmCode, season] = sub.split(' · ');
      return { activityType: m[1].trim().toUpperCase().replace(/\s+/g, '_'), farmCode: farmCode ?? '', season: season ?? '' };
    }
    case 'inventory.received': {
      if (title !== 'Harvest received at warehouse' || !(m = /^([\d.,]+) kg · ([^·]+?)(?: · (.+))?$/.exec(sub))) return null;
      return { weightKg: num(m[1]), trackingCode: m[2], farmCode: m[3] ?? '' };
    }
    case 'officer.visit':
      return title === 'Field officer visited you' ? { note: sub } : null;
    case 'expense.added': {
      if (!(m = /^Recorded expense: (.+)$/.exec(title))) return null;
      const s = /^TZS ([\d.,]+) · (.+)$/.exec(sub);
      return { item: m[1], amount: s ? num(s[1]) : '', farmCode: s ? s[2] : '' };
    }
    case 'revenue.added': {
      if (!(m = /^Sale recorded: ([\d.,]+)kg$/.exec(title))) return null;
      const s = /^TZS ([\d.,]+) · (.+)$/.exec(sub);
      return { quantityKg: num(m[1]), amount: s ? num(s[1]) : '', farmCode: s ? s[2] : '' };
    }
    case 'sale.apportioned': {
      if (!(m = /^Cooperative sale recorded: (.+)$/.exec(title))) return null;
      const s = /^TZS ([\d.,]+) pending payment$/.exec(sub);
      return { invoice: m[1], amount: s ? num(s[1]) : '' };
    }
    default:
      return null;
  }
}

/**
 * The activity's wording in the app language. Activities saved with facts (`params`) are built from
 * translated templates; older ones fall back to the English sentence the server stored.
 */
export function activityText(
  item: ActivityLike,
  t: Translate,
  language: Language,
): { title: string; subtitle: string; tag: string | null } {
  const type = item.type ?? '';
  const base = `act_${slug(type)}`;
  const fallbackTag = type ? (type.split('.').pop() ?? type).replace(/_/g, ' ') : null;

  const params = item.params ?? legacyParams(item);
  if (!type || !params || !hasTranslation(`${base}_t`)) {
    return { title: item.title ?? '', subtitle: item.subtitle ?? '', tag: hasTranslation(`act_tag_${slug(type)}`) ? t(`act_tag_${slug(type)}` as TranslationKey) : fallbackTag };
  }

  const p = params;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p)) vars[k] = v == null ? '' : String(v);
  if ('amount' in p) vars.amount = formatNumber(p.amount, language);
  if ('weightKg' in p) vars.weightKg = formatNumber(p.weightKg, language);
  if ('quantityKg' in p) vars.quantityKg = formatNumber(p.quantityKg, language);
  if ('status' in p) vars.status = enumLabel('act_status_', p.status, t);
  if ('docType' in p) vars.docType = enumLabel('act_doc_', p.docType, t);
  if ('activityType' in p) {
    const key = ACTIVITY_LABEL_KEYS[String(p.activityType)];
    vars.activityType = key ? t(key).toLowerCase() : String(p.activityType ?? '').replace(/_/g, ' ').toLowerCase();
  }

  return {
    title: tidy(t(`${base}_t` as TranslationKey, vars)),
    subtitle: hasTranslation(`${base}_s`) ? tidy(t(`${base}_s` as TranslationKey, vars)) : '',
    tag: hasTranslation(`act_tag_${slug(type)}`) ? t(`act_tag_${slug(type)}` as TranslationKey) : fallbackTag,
  };
}
