import {
  enrichRiceSorter,
  enrichSoilTester,
  farmSoilPatchFromTest,
} from './ai-enrichment';

describe('ai-enrichment', () => {
  it('recommends lime for acidic soil and flags low N', () => {
    const { recommendation, payload } = enrichSoilTester({
      ph: 5.1,
      nitrogenPpm: 12,
      organicMatter: 1.5,
    });
    expect(payload.schema).toBe('mayode.soil_tester.v1');
    expect(recommendation.fertilizerPlan.limeSuggested).toBe(true);
    expect(recommendation.fertilizerPlan.nitrogenFocus).toBe(true);
    expect(recommendation.severity).toBe('HIGH');
  });

  it('syncs farm soil patch from texture and pH', () => {
    const patch = farmSoilPatchFromTest({
      texture: 'Clay loam',
      ph: 6.2,
      organicMatter: 3,
    });
    expect(patch.soilType).toBe('Clay loam');
    expect(patch.soilCondition).toBe('Near-neutral');
    expect(patch.soilFertility).toBe('Moderate–good');
  });

  it('derives sorter grade and flags high moisture', () => {
    const { recommendation, payload } = enrichRiceSorter({
      moisturePct: 15.5,
      brokenPct: 10,
    });
    expect(payload.schema).toBe('mayode.rice_sorter.v1');
    expect(payload.qualityGrade).toBeTruthy();
    expect(recommendation.severity).toBe('HIGH');
    expect(String(recommendation.summary)).toContain('moisture');
  });
});
