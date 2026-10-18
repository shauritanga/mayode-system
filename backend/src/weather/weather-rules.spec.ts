import { adviceFor, alertAreaKey, cropCounts, draftAlerts, fitUssd, summarize, ussdOutlook, type ForecastDay } from './weather-rules';

const day = (date: string, mm: number | null, max = 30): ForecastDay => ({ date, precipitationMm: mm, maxTempC: max, minTempC: 20 });
const week = (mms: number[], max = 30) => mms.map((m, i) => day(`2026-03-0${i + 1}`, m, max));
const crops = (stages: (string | null)[]) => cropCounts(stages);

describe('weather rules', () => {
  it('summarises a week', () => {
    const s = summarize(week([0, 0, 0, 5, 0, 0, 30], 33));
    expect(s).toMatchObject({ totalMm: 35, next3Mm: 0, maxDayMm: 30, maxDryRun: 3, wetDays: 2, maxTempC: 33 });
    expect(summarize(week([0, 0, 0, 0, 0, 0, 0])).maxDryRun).toBe(7);
  });

  it('counts crops by stage group', () => {
    expect(crops(['LAND_PREPARATION', 'TILLERING', 'FLOWERING', 'HARVEST', null])).toEqual({ total: 5, preparing: 1, susceptible: 2, growing: 2 });
  });

  it('drafts nothing for an area with no crops', () => {
    expect(draftAlerts(summarize(week([80, 80, 0, 0, 0, 0, 0])), crops([]), 'Mbarali')).toEqual([]);
  });

  it('drafts a high flood alert for very heavy rain and a medium one for a wet week', () => {
    const heavy = draftAlerts(summarize(week([70, 20, 10, 0, 0, 0, 0])), crops(['TILLERING']), 'Mbarali').find((a) => a.type === 'FLOOD')!;
    expect(heavy.severity).toBe('HIGH');
    expect(heavy.en.title).toContain('Mbarali');
    expect(heavy.sw.message).toContain('mvua');
    const wet = draftAlerts(summarize(week([10, 10, 10, 10, 10, 10, 10])), crops(['TILLERING']), 'X').find((a) => a.type === 'FLOOD')!;
    expect(wet.severity).toBe('MEDIUM');
  });

  it('drafts drought only from a real dry run, and irrigation for a shorter one', () => {
    expect(draftAlerts(summarize(week([0, 0, 0, 0, 0, 0, 0])), crops(['TILLERING']), 'X').find((a) => a.type === 'DROUGHT')!.severity).toBe('HIGH');
    expect(draftAlerts(summarize(week([0, 0, 0, 0, 0, 3, 3])), crops(['TILLERING']), 'X').find((a) => a.type === 'DROUGHT')!.severity).toBe('MEDIUM');
    const short = draftAlerts(summarize(week([0, 0, 0, 5, 1, 2, 0])), crops(['TILLERING']), 'X').map((a) => a.type);
    expect(short).toContain('IRRIGATION_RECOMMENDATION');
    expect(short).not.toContain('DROUGHT');
  });

  it('drafts disease and pest alerts only when crops are at a susceptible stage', () => {
    const wet = week([5, 5, 5, 5, 0, 0, 0]);
    expect(draftAlerts(summarize(wet), crops(['FLOWERING']), 'X').map((a) => a.type)).toContain('DISEASE');
    expect(draftAlerts(summarize(wet), crops(['PLANTING']), 'X').map((a) => a.type)).not.toContain('DISEASE');
    const hotDry = summarize(week([0, 0, 0, 0, 0, 0, 0], 35));
    expect(draftAlerts(hotDry, crops(['TILLERING']), 'X').map((a) => a.type)).toContain('PEST');
    expect(draftAlerts(hotDry, crops(['PLANTING']), 'X').map((a) => a.type)).not.toContain('PEST');
  });

  it('suggests planting when fields are being prepared and rain is moderate', () => {
    expect(draftAlerts(summarize(week([5, 5, 5, 5, 0, 0, 0])), crops(['NURSERY_PREPARATION']), 'X').map((a) => a.type)).toContain('PLANTING_RECOMMENDATION');
    expect(draftAlerts(summarize(week([0, 0, 0, 0, 0, 0, 0])), crops(['NURSERY_PREPARATION']), 'X').map((a) => a.type)).not.toContain('PLANTING_RECOMMENDATION');
  });

  it('gives stage advice adjusted by the forecast, in both languages', () => {
    const a = adviceFor('FLOWERING', summarize(week([0, 0, 0, 0, 0, 0, 0], 36)));
    expect(a.en.length).toBe(a.sw.length);
    expect(a.en.join(' ')).toContain('flooded');
    expect(adviceFor(null, null)).toEqual({ en: [], sw: [] });
    expect(adviceFor('TILLERING', summarize(week([30, 30, 5, 0, 0, 0, 0]))).en.join(' ')).toContain('Heavy rain');
  });

  it('keys areas, and keeps USSD text short', () => {
    expect(alertAreaKey('m1', 'Mbeya', 'Mbarali')).toBe('m1|Mbeya|Mbarali');
    expect(alertAreaKey(null, null, null)).toBe('-||');
    expect(ussdOutlook(week([0, 12, 0]), false).split('\n')).toHaveLength(3);
    expect(fitUssd('a '.repeat(100)).length).toBeLessThanOrEqual(150);
    expect(fitUssd('short')).toBe('short');
  });
});
