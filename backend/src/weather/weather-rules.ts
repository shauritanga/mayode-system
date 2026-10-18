export interface ForecastDay {
  date: string;
  maxTempC: number | null;
  minTempC: number | null;
  precipitationMm: number | null;
}

export interface ForecastSummary {
  totalMm: number;
  next3Mm: number;
  maxDayMm: number;
  maxDryRun: number;
  wetDays: number;
  maxTempC: number | null;
}

const WET_DAY_MM = 2;
const DRY_DAY_MM = 1;

const mm = (d: ForecastDay) => d.precipitationMm ?? 0;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function summarize(days: ForecastDay[]): ForecastSummary {
  let run = 0;
  let maxDryRun = 0;
  for (const d of days) {
    if (mm(d) < DRY_DAY_MM) {
      run += 1;
      maxDryRun = Math.max(maxDryRun, run);
    } else run = 0;
  }
  const temps = days.map((d) => d.maxTempC).filter((t): t is number => t != null);
  return {
    totalMm: r1(days.reduce((t, d) => t + mm(d), 0)),
    next3Mm: r1(days.slice(0, 3).reduce((t, d) => t + mm(d), 0)),
    maxDayMm: r1(Math.max(0, ...days.map(mm))),
    maxDryRun,
    wetDays: days.filter((d) => mm(d) >= WET_DAY_MM).length,
    maxTempC: temps.length ? Math.max(...temps) : null,
  };
}

/** How many of an area's crops are at each kind of stage. */
export interface AreaCrops {
  total: number;
  /** Land and nursery preparation: planting decisions are near. */
  preparing: number;
  /** Tillering to grain filling: most exposed to pests, disease and water shortage. */
  susceptible: number;
  /** Anything growing in the field, from planting to grain filling. */
  growing: number;
}

const SUSCEPTIBLE = ['TILLERING', 'PANICLE_INITIATION', 'FLOWERING', 'GRAIN_FILLING'];
const PREPARING = ['LAND_PREPARATION', 'NURSERY_PREPARATION'];
const GROWING = ['PLANTING', 'GERMINATION', 'VEGETATIVE_GROWTH', ...SUSCEPTIBLE];

export function cropCounts(stages: (string | null)[]): AreaCrops {
  return {
    total: stages.length,
    preparing: stages.filter((s) => s && PREPARING.includes(s)).length,
    susceptible: stages.filter((s) => s && SUSCEPTIBLE.includes(s)).length,
    growing: stages.filter((s) => s && GROWING.includes(s)).length,
  };
}

export type DraftType = 'FLOOD' | 'DROUGHT' | 'PEST' | 'DISEASE' | 'PLANTING_RECOMMENDATION' | 'IRRIGATION_RECOMMENDATION';
export type DraftSeverity = 'LOW' | 'MEDIUM' | 'HIGH';
export interface Text {
  title: string;
  message: string;
}
export interface AlertDraft {
  type: DraftType;
  severity: DraftSeverity;
  en: Text;
  sw: Text;
  evidence: ForecastSummary & { farms: number };
}

/** Which alerts the forecast justifies for an area with these crops. Staff review every one before it is sent. */
export function draftAlerts(s: ForecastSummary, crops: AreaCrops, place: string): AlertDraft[] {
  if (crops.total === 0) return [];
  const out: AlertDraft[] = [];
  const evidence = { ...s, farms: crops.total };
  const add = (type: DraftType, severity: DraftSeverity, en: Text, sw: Text) => out.push({ type, severity, en, sw, evidence });

  if (s.next3Mm >= 100 || s.maxDayMm >= 60 || s.totalMm >= 60) {
    const severe = s.next3Mm >= 100 || s.maxDayMm >= 60;
    add(
      'FLOOD', severe ? 'HIGH' : 'MEDIUM',
      { title: `Heavy rain expected in ${place}`, message: `${s.totalMm} mm of rain is forecast this week${severe ? `, with up to ${s.maxDayMm} mm in one day` : ''}. Open drainage channels, protect seedlings and delay fertiliser or spraying until the rain passes.` },
      { title: `Mvua kubwa inatarajiwa ${place}`, message: `Mvua ya mm ${s.totalMm} inatarajiwa wiki hii${severe ? `, hadi mm ${s.maxDayMm} kwa siku moja` : ''}. Fungua mifereji ya maji, linda miche, na subiri mvua ipite kabla ya kuweka mbolea au dawa.` },
    );
  }
  if (s.maxDryRun >= 5) {
    const long = s.maxDryRun >= 7;
    add(
      'DROUGHT', long ? 'HIGH' : 'MEDIUM',
      { title: `Dry spell expected in ${place}`, message: `About ${s.maxDryRun} days with almost no rain are forecast. Keep water in the fields where you can, irrigate in the evening, and avoid transplanting until rain returns.` },
      { title: `Ukame unatarajiwa ${place}`, message: `Takriban siku ${s.maxDryRun} bila mvua zinatarajiwa. Tunza maji shambani unapoweza, mwagilia jioni, na usipandikize hadi mvua irudi.` },
    );
  } else if (s.maxDryRun >= 3 && s.totalMm < 15 && crops.growing > 0) {
    add(
      'IRRIGATION_RECOMMENDATION', 'MEDIUM',
      { title: `Irrigate your rice in ${place}`, message: `Little rain is forecast (${s.totalMm} mm this week). Check water levels and irrigate fields in tillering or flowering first.` },
      { title: `Mwagilia mpunga wako ${place}`, message: `Mvua kidogo inatarajiwa (mm ${s.totalMm} wiki hii). Kagua kina cha maji na umwagilie kwanza mashamba yaliyo kwenye kuchipua matawi au kuchanua.` },
    );
  }
  if (crops.susceptible > 0 && s.wetDays >= 4) {
    add(
      'DISEASE', 'MEDIUM',
      { title: `Rice blast risk in ${place}`, message: `A wet week is forecast and ${crops.susceptible} farm${crops.susceptible === 1 ? ' is' : 's are'} at a stage that blast and brown spot attack. Scout fields, look for diamond-shaped leaf spots, and avoid extra nitrogen.` },
      { title: `Hatari ya ugonjwa wa blast ${place}`, message: `Wiki yenye mvua inatarajiwa na mashamba ${crops.susceptible} yako kwenye hatua inayoshambuliwa na blast. Kagua mashamba, tafuta madoa ya umbo la almasi kwenye majani, na usiongeze naitrojeni.` },
    );
  }
  if (crops.susceptible > 0 && s.maxDryRun >= 5 && (s.maxTempC ?? 0) >= 32) {
    add(
      'PEST', 'LOW',
      { title: `Pest watch in ${place}`, message: `A hot, dry spell favours stem borers and planthoppers. Check the base of the plants this week and report heavy damage to your field officer.` },
      { title: `Angalia wadudu ${place}`, message: `Kipindi cha joto na ukavu kinafaa kwa wadudu wachimbaji wa shina na planthoppers. Kagua sehemu ya chini ya mimea wiki hii na umweleze afisa ugani ukiona uharibifu mkubwa.` },
    );
  }
  if (crops.preparing > 0 && s.totalMm >= 20 && s.totalMm <= 80 && s.maxDayMm < 40) {
    add(
      'PLANTING_RECOMMENDATION', 'LOW',
      { title: `Good planting window in ${place}`, message: `Steady, moderate rain is forecast (${s.totalMm} mm this week). Farmers with land and nurseries ready can transplant now.` },
      { title: `Wakati mzuri wa kupanda ${place}`, message: `Mvua ya wastani na ya kutosha inatarajiwa (mm ${s.totalMm} wiki hii). Wakulima waliotayarisha shamba na kitalu wanaweza kupandikiza sasa.` },
    );
  }
  return out;
}

export const alertAreaKey = (mamcosId: string | null, region: string | null, district: string | null) =>
  `${mamcosId ?? '-'}|${region ?? ''}|${district ?? ''}`;

export interface Advice {
  en: string[];
  sw: string[];
}

const STAGE_ADVICE: Record<string, Advice> = {
  LAND_PREPARATION: { en: ['Level the field and repair bunds before the rains settle.'], sw: ['Sawazisha shamba na tengeneza kingo kabla mvua hazijatulia.'] },
  NURSERY_PREPARATION: { en: ['Keep the nursery moist and shaded from strong sun.'], sw: ['Weka kitalu na unyevu na ukilinde na jua kali.'] },
  PLANTING: { en: ['Transplant seedlings of 14–21 days and keep a thin film of water.'], sw: ['Pandikiza miche ya siku 14–21 na weka maji kidogo shambani.'] },
  VEGETATIVE_GROWTH: { en: ['Weed early and apply top-dressing fertiliser as advised.'], sw: ['Palilia mapema na weka mbolea ya kukuzia kama ulivyoshauriwa.'] },
  TILLERING: { en: ['Keep 3–5 cm of water and top-dress with nitrogen once.'], sw: ['Weka maji sentimita 3–5 na weka mbolea ya naitrojeni mara moja.'] },
  PANICLE_INITIATION: { en: ['Do not let the field dry out; this stage sets the grain count.'], sw: ['Usiache shamba likauke; hatua hii huamua idadi ya punje.'] },
  FLOWERING: { en: ['Keep water in the field. Heat or drought now cuts yield most.'], sw: ['Weka maji shambani. Joto au ukame sasa hupunguza mavuno zaidi.'] },
  GRAIN_FILLING: { en: ['Keep water until grains harden, then start draining.'], sw: ['Weka maji hadi punje zigande, kisha anza kutoa maji.'] },
  MATURITY: { en: ['Drain the field and get ready to harvest when 80–85% of grains are golden.'], sw: ['Toa maji shambani na jiandae kuvuna punje 80–85% zikiwa za dhahabu.'] },
  HARVEST: { en: ['Harvest and dry quickly; do not leave cut rice in the rain.'], sw: ['Vuna na kausha haraka; usiache mpunga uliovunwa kwenye mvua.'] },
};

/** What a farmer should do at their crop's stage, adjusted for this week's forecast. */
export function adviceFor(stage: string | null, s: ForecastSummary | null): Advice {
  const out: Advice = { en: [], sw: [] };
  const base = stage ? STAGE_ADVICE[stage === 'GERMINATION' ? 'VEGETATIVE_GROWTH' : stage] : null;
  if (base) { out.en.push(...base.en); out.sw.push(...base.sw); }
  if (!s) return out;
  const susceptible = stage ? SUSCEPTIBLE.includes(stage) : false;
  if (s.next3Mm >= 60 || s.maxDayMm >= 50) {
    out.en.push('Heavy rain is coming: clear drains, and hold fertiliser and spraying until it passes.');
    out.sw.push('Mvua kubwa inakuja: safisha mifereji, na usiweke mbolea wala dawa hadi mvua ipite.');
  }
  if (s.maxDryRun >= 4) {
    out.en.push('A dry spell is coming: top up water and irrigate in the evening.');
    out.sw.push('Ukame unakuja: ongeza maji na mwagilia jioni.');
  }
  if ((s.maxTempC ?? 0) >= 34 && (stage === 'FLOWERING' || stage === 'GRAIN_FILLING')) {
    out.en.push('Very hot days ahead: keep the field flooded while the crop flowers or fills.');
    out.sw.push('Siku za joto kali zinakuja: weka shamba na maji wakati mpunga unachanua au kujaza punje.');
  }
  if (susceptible && s.wetDays >= 4) {
    out.en.push('A wet week raises blast risk: scout for leaf spots and skip extra nitrogen.');
    out.sw.push('Wiki yenye mvua huongeza hatari ya blast: kagua madoa ya majani na usiongeze naitrojeni.');
  }
  return out;
}

/** A 3-day outlook that fits one USSD screen. */
export function ussdOutlook(days: ForecastDay[], sw: boolean): string {
  const names = sw ? ['Jpl', 'Jtt', 'Jnn', 'Jtn', 'Alh', 'Ijm', 'Jms'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const line = (d: ForecastDay) => {
    const dow = names[new Date(`${d.date}T12:00:00Z`).getUTCDay()];
    const t = d.maxTempC != null ? `${Math.round(d.maxTempC)}C` : '';
    return `${dow} ${t} ${mm(d) >= 1 ? `${Math.round(mm(d))}mm` : sw ? 'kavu' : 'dry'}`.replace(/\s+/g, ' ').trim();
  };
  return days.slice(0, 3).map(line).join('\n');
}

/** USSD screens are short: cut on a word boundary. */
export function fitUssd(text: string, max = 150): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : cut.length)}…`;
}
