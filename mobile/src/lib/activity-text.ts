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

  if (!type || !item.params || !hasTranslation(`${base}_t`)) {
    return { title: item.title ?? '', subtitle: item.subtitle ?? '', tag: hasTranslation(`act_tag_${slug(type)}`) ? t(`act_tag_${slug(type)}` as TranslationKey) : fallbackTag };
  }

  const p = item.params;
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
