import { canMove, isExpired, nextReference } from './agreement-rules';

describe('agreement rules', () => {
  it('only allows sensible status moves', () => {
    expect(canMove('DRAFT', 'ACTIVE')).toBe(true);
    expect(canMove('ACTIVE', 'FULFILLED')).toBe(true);
    expect(canMove('DRAFT', 'FULFILLED')).toBe(false);
    expect(canMove('FULFILLED', 'ACTIVE')).toBe(false);
    expect(canMove('CANCELLED', 'ACTIVE')).toBe(false);
  });

  it('marks only active agreements past their end date as expired', () => {
    const now = new Date('2026-06-01');
    expect(isExpired('ACTIVE', new Date('2026-05-31'), now)).toBe(true);
    expect(isExpired('ACTIVE', new Date('2026-06-02'), now)).toBe(false);
    expect(isExpired('FULFILLED', new Date('2026-05-31'), now)).toBe(false);
  });

  it('numbers references per year', () => {
    expect(nextReference(2026)).toBe('PA-2026-0001');
    expect(nextReference(2026, 'PA-2026-0009')).toBe('PA-2026-0010');
  });
});
