/**
 * Transparent rule helpers for AI equipment intake (I3/I4).
 * Thresholds are documented rice-soil heuristics — not opaque ML scores.
 */

export const SOIL_TESTER_SCHEMA = 'mayode.soil_tester.v1';
export const RICE_SORTER_SCHEMA = 'mayode.rice_sorter.v1';
export const QR_TRACEABILITY_SCHEMA = 'mayode.qr_traceability.v1';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

export type SoilPayload = {
  schema?: string;
  ph?: number;
  nitrogenPpm?: number;
  phosphorusPpm?: number;
  potassiumPpm?: number;
  organicMatter?: number;
  texture?: string;
  fertilityClass?: string;
  notes?: string;
  syncFarmSoil?: boolean;
  modelProvider?: string;
  modelVersion?: string;
  [key: string]: unknown;
};

export type SorterPayload = {
  schema?: string;
  qualityGrade?: string;
  moisturePct?: number;
  brokenPct?: number;
  chalkyPct?: number;
  headRicePct?: number;
  sampleWeightKg?: number;
  notes?: string;
  modelProvider?: string;
  modelVersion?: string;
  [key: string]: unknown;
};

function num(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function maxSeverity(a: Severity, b: Severity): Severity {
  const rank = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  return rank[b] > rank[a] ? b : a;
}

/** Build fertilizer recommendation from structured soil lab/device fields. */
export function enrichSoilTester(
  raw: Record<string, unknown>,
  existing?: Record<string, unknown> | null,
) {
  const payload: SoilPayload = {
    ...raw,
    schema: SOIL_TESTER_SCHEMA,
    ph: num(raw.ph),
    nitrogenPpm: num(raw.nitrogenPpm ?? raw.nPpm ?? raw.nitrogen),
    phosphorusPpm: num(raw.phosphorusPpm ?? raw.pPpm ?? raw.phosphorus),
    potassiumPpm: num(raw.potassiumPpm ?? raw.kPpm ?? raw.potassium),
    organicMatter: num(raw.organicMatter ?? raw.omPct),
    texture: typeof raw.texture === 'string' ? raw.texture : undefined,
    fertilityClass:
      typeof raw.fertilityClass === 'string' ? raw.fertilityClass : undefined,
    syncFarmSoil: raw.syncFarmSoil !== false,
  };

  const findings: { code: string; severity: Severity; message: string }[] = [];
  const actions: string[] = [];
  let severity: Severity = 'LOW';

  if (payload.ph != null) {
    if (payload.ph < 5.5) {
      findings.push({
        code: 'SOIL_ACIDIC',
        severity: 'HIGH',
        message: `Soil pH ${payload.ph} is acidic for rice — liming usually improves nutrient availability.`,
      });
      actions.push(
        'Apply agricultural lime (typically 0.5–1.5 t/ha depending on soil texture) before transplanting; retest pH next season.',
      );
      severity = maxSeverity(severity, 'HIGH');
    } else if (payload.ph > 7.5) {
      findings.push({
        code: 'SOIL_ALKALINE',
        severity: 'MEDIUM',
        message: `Soil pH ${payload.ph} is alkaline — avoid further liming; prefer acidifying N sources if needed.`,
      });
      actions.push(
        'Skip lime. Prefer ammonium sulfate or urea with organic matter rather than additional lime.',
      );
      severity = maxSeverity(severity, 'MEDIUM');
    } else {
      findings.push({
        code: 'SOIL_PH_OK',
        severity: 'LOW',
        message: `Soil pH ${payload.ph} is in a workable range for irrigated rice.`,
      });
    }
  }

  if (payload.organicMatter != null && payload.organicMatter < 2) {
    findings.push({
      code: 'LOW_ORGANIC_MATTER',
      severity: 'MEDIUM',
      message: `Organic matter ${payload.organicMatter}% is low — soil structure and N supply may be weak.`,
    });
    actions.push(
      'Incorporate rice straw/compost or farmyard manure; consider basal N with organic amendment.',
    );
    severity = maxSeverity(severity, 'MEDIUM');
  }

  if (payload.nitrogenPpm != null && payload.nitrogenPpm < 20) {
    findings.push({
      code: 'LOW_NITROGEN',
      severity: 'HIGH',
      message: `Available N (${payload.nitrogenPpm} ppm) looks low for target rice yield.`,
    });
    actions.push(
      'Plan split N (basal + tillering + panicle) — e.g. urea; confirm local extension rates for your variety.',
    );
    severity = maxSeverity(severity, 'HIGH');
  }

  if (payload.phosphorusPpm != null && payload.phosphorusPpm < 15) {
    findings.push({
      code: 'LOW_PHOSPHORUS',
      severity: 'MEDIUM',
      message: `Available P (${payload.phosphorusPpm} ppm) is low — basal P often needed at planting.`,
    });
    actions.push('Apply basal DAP/TSP at transplanting per AMCOS/extension guidance.');
    severity = maxSeverity(severity, 'MEDIUM');
  }

  if (payload.potassiumPpm != null && payload.potassiumPpm < 80) {
    findings.push({
      code: 'LOW_POTASSIUM',
      severity: 'MEDIUM',
      message: `Available K (${payload.potassiumPpm} ppm) is low — grain filling may suffer.`,
    });
    actions.push('Include muriate of potash (MOP) in basal or mid-season fertilizer.');
    severity = maxSeverity(severity, 'MEDIUM');
  }

  if (!findings.length) {
    findings.push({
      code: 'SOIL_BASELINE',
      severity: 'LOW',
      message:
        'Soil test stored. Add pH / OM / N-P-K fields for automated fertilizer guidance.',
    });
    actions.push('Complete lab fields (pH, OM, N, P, K) on the next soil test for richer recommendations.');
  }

  const summary =
    existing?.summary && typeof existing.summary === 'string'
      ? existing.summary
      : severity === 'HIGH'
        ? 'Priority fertilizer / liming actions from soil test'
        : severity === 'MEDIUM'
          ? 'Soil test suggests nutrient adjustments this season'
          : 'Soil test recorded — nutrients look manageable';

  const recommendation = {
    schema: SOIL_TESTER_SCHEMA,
    summary,
    severity: (existing?.severity as Severity) || severity,
    findings,
    actions: [...new Set(actions)].slice(0, 8),
    fertilizerPlan: {
      limeSuggested: findings.some((f) => f.code === 'SOIL_ACIDIC'),
      nitrogenFocus: findings.some((f) => f.code === 'LOW_NITROGEN' || f.code === 'LOW_ORGANIC_MATTER'),
      phosphorusFocus: findings.some((f) => f.code === 'LOW_PHOSPHORUS'),
      potassiumFocus: findings.some((f) => f.code === 'LOW_POTASSIUM'),
    },
    generatedAt: new Date().toISOString(),
    engine: 'mayode.soil-fertilizer.rules.v1',
  };

  return { payload, recommendation };
}

/** Normalize sorter payload and derive grade/moisture recommendation. */
export function enrichRiceSorter(
  raw: Record<string, unknown>,
  existing?: Record<string, unknown> | null,
) {
  const moisturePct = num(raw.moisturePct ?? raw.moistureContentPct ?? raw.moisture);
  const brokenPct = num(raw.brokenPct);
  const chalkyPct = num(raw.chalkyPct);
  const headRicePct = num(raw.headRicePct);
  let qualityGrade =
    typeof raw.qualityGrade === 'string' && raw.qualityGrade.trim()
      ? raw.qualityGrade.trim().toUpperCase()
      : undefined;

  if (!qualityGrade) {
    if (brokenPct != null && brokenPct > 25) qualityGrade = 'C';
    else if (brokenPct != null && brokenPct > 15) qualityGrade = 'B';
    else if (headRicePct != null && headRicePct >= 55) qualityGrade = 'A';
    else if (moisturePct != null && moisturePct > 14) qualityGrade = 'B';
    else qualityGrade = 'A';
  }

  const findings: { code: string; severity: Severity; message: string }[] = [];
  const actions: string[] = [];
  let severity: Severity = 'LOW';

  if (moisturePct != null && moisturePct > 14) {
    findings.push({
      code: 'HIGH_MOISTURE',
      severity: 'HIGH',
      message: `Sorter moisture ${moisturePct}% exceeds the 14% warehouse target.`,
    });
    actions.push('Continue drying before export sale; re-check moisture after drying.');
    severity = 'HIGH';
  }

  if (brokenPct != null && brokenPct > 20) {
    findings.push({
      code: 'HIGH_BROKEN',
      severity: 'MEDIUM',
      message: `Broken grain ${brokenPct}% is elevated — expect lower export grade.`,
    });
    actions.push('Segregate for domestic/broken markets or blend carefully with higher-grade lots.');
    severity = maxSeverity(severity, 'MEDIUM');
  }

  if (!findings.length) {
    findings.push({
      code: 'SORTER_OK',
      severity: 'LOW',
      message: `Sorter grade ${qualityGrade} looks suitable for cooperative sale.`,
    });
  }

  const payload: SorterPayload = {
    ...raw,
    schema: RICE_SORTER_SCHEMA,
    qualityGrade,
    moisturePct,
    brokenPct,
    chalkyPct,
    headRicePct,
    sampleWeightKg: num(raw.sampleWeightKg),
  };

  const recommendation = {
    schema: RICE_SORTER_SCHEMA,
    summary:
      (typeof existing?.summary === 'string' && existing.summary) ||
      `Lot quality grade ${qualityGrade}${moisturePct != null ? ` · ${moisturePct}% moisture` : ''}`,
    severity,
    qualityGrade,
    moisturePct,
    findings,
    actions: [...new Set(actions)].slice(0, 6),
    generatedAt: new Date().toISOString(),
    engine: 'mayode.rice-sorter.rules.v1',
  };

  return { payload, recommendation };
}

export function farmSoilPatchFromTest(payload: SoilPayload): {
  soilType?: string;
  soilCondition?: string;
  soilFertility?: string;
} {
  const patch: {
    soilType?: string;
    soilCondition?: string;
    soilFertility?: string;
  } = {};
  if (payload.texture) patch.soilType = String(payload.texture);
  if (payload.ph != null) {
    patch.soilCondition =
      payload.ph < 5.5 ? 'Acidic' : payload.ph > 7.5 ? 'Alkaline' : 'Near-neutral';
  }
  if (payload.fertilityClass) {
    patch.soilFertility = String(payload.fertilityClass);
  } else if (
    payload.organicMatter != null ||
    payload.nitrogenPpm != null ||
    payload.phosphorusPpm != null
  ) {
    const lowOm = payload.organicMatter != null && payload.organicMatter < 2;
    const lowN = payload.nitrogenPpm != null && payload.nitrogenPpm < 20;
    patch.soilFertility = lowOm || lowN ? 'Low–moderate' : 'Moderate–good';
  }
  return patch;
}
