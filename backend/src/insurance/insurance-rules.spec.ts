import {
  assessRisk, canMoveInsuranceApplication, claimPaymentStatus, claimsRatio, nextInsuranceReference,
  PRODUCT_GUIDE, suggestSumInsured, yieldCv,
} from './insurance-rules';

const calm = { droughtAlerts: 0, floodAlerts: 0, pestOrDiseaseAlerts: 0, severeAlerts: 0, priorClaims: 0, hasIrrigation: true, harvests: 3, yieldCv: 0.1 };

describe('insurance rules', () => {
  it('describes all five products', () => {
    expect(PRODUCT_GUIDE.map((p) => p.key).sort()).toEqual(['AREA_YIELD', 'CREDIT_LINKED', 'INPUT_INSURANCE', 'MULTI_PERIL', 'WEATHER_INDEX']);
  });

  it('suggests a sum insured by product', () => {
    expect(suggestSumInsured('MULTI_PERIL', 2, 5_000_000, 800_000)).toBe(7_000_000);
    expect(suggestSumInsured('INPUT_INSURANCE', 2, 5_000_000, 800_000)).toBe(1_600_000);
    expect(suggestSumInsured('CREDIT_LINKED', 2, 5_000_000, 800_000, 2_345_678)).toBe(2_346_000);
    expect(suggestSumInsured('CREDIT_LINKED', 2, 5_000_000, 800_000)).toBe(7_000_000);
    expect(suggestSumInsured('AREA_YIELD', 0, 5_000_000, null)).toBeNull();
    expect(suggestSumInsured('AREA_YIELD', 1, null, null)).toBeNull();
  });

  it('measures yield variation', () => {
    expect(yieldCv([4000])).toBeNull();
    expect(yieldCv([4000, 4000])).toBe(0);
    expect(yieldCv([2000, 6000])).toBe(0.5);
  });

  it('rates a calm irrigated farm low and an exposed one high', () => {
    expect(assessRisk(calm).level).toBe('LOW');
    const bad = assessRisk({ ...calm, droughtAlerts: 4, floodAlerts: 3, severeAlerts: 3, priorClaims: 2, hasIrrigation: false, yieldCv: 0.5 });
    expect(bad.level).toBe('HIGH');
    expect(bad.factors.map((f) => f.label)).toContain('Drought warnings in the area');
    expect(assessRisk({ ...calm, droughtAlerts: 1, hasIrrigation: false }).level).toBe('LOW');
    expect(assessRisk({ ...calm, droughtAlerts: 3, hasIrrigation: false }).level).toBe('MEDIUM');
  });

  it('limits application status moves and numbers references', () => {
    expect(canMoveInsuranceApplication('SUBMITTED', 'APPROVED')).toBe(true);
    expect(canMoveInsuranceApplication('APPROVED', 'ACTIVATED')).toBe(true);
    expect(canMoveInsuranceApplication('ACTIVATED', 'WITHDRAWN')).toBe(false);
    expect(canMoveInsuranceApplication('REJECTED', 'APPROVED')).toBe(false);
    expect(nextInsuranceReference(2026)).toBe('IA-2026-0001');
    expect(nextInsuranceReference(2026, 'IA-2026-0019')).toBe('IA-2026-0020');
  });

  it('reports claim payment status', () => {
    expect(claimPaymentStatus({ status: 'SUBMITTED' })).toBe('NOT_DUE');
    expect(claimPaymentStatus({ status: 'REJECTED', approvedAmount: 100 })).toBe('NOT_DUE');
    expect(claimPaymentStatus({ status: 'APPROVED', approvedAmount: 100, paidAmount: 0 })).toBe('PENDING');
    expect(claimPaymentStatus({ status: 'APPROVED', approvedAmount: 100, paidAmount: 40 })).toBe('PARTIAL');
    expect(claimPaymentStatus({ status: 'PAID', approvedAmount: 100, paidAmount: 100 })).toBe('PAID');
    expect(claimsRatio(1000, 450)).toBe(45);
    expect(claimsRatio(0, 10)).toBe(0);
  });
});
