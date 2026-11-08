import { deriveRegistrationTier } from './farmer-tier';

describe('registration tier', () => {
  const base = { idType: null, heldThroughGuardian: false, hasLocalVerification: false } as const;
  it('is standard for a farmer with any primary ID, NIDA or not', () => {
    expect(deriveRegistrationTier({ ...base, idType: 'NIDA' })).toEqual({ tier: 'STANDARD', identifierUsed: 'NIDA' });
    expect(deriveRegistrationTier({ ...base, idType: 'VOTER_ID' })).toEqual({ tier: 'STANDARD', identifierUsed: 'VOTER_ID' });
    expect(deriveRegistrationTier({ ...base, idType: 'DRIVER_LICENSE' })).toEqual({ tier: 'STANDARD', identifierUsed: 'DRIVER_LICENSE' });
  });
  it('is family when the plot is held through a guardian, even if the holder has an ID', () => {
    expect(deriveRegistrationTier({ ...base, heldThroughGuardian: true, idType: 'NIDA' })).toEqual({ tier: 'FAMILY', identifierUsed: 'GUARDIAN' });
    expect(deriveRegistrationTier({ ...base, heldThroughGuardian: true, hasLocalVerification: true }).tier).toBe('FAMILY');
  });
  it('is alternative-ID only for a farmer with no primary ID who is vouched for locally', () => {
    expect(deriveRegistrationTier({ ...base, hasLocalVerification: true })).toEqual({ tier: 'ALTERNATIVE_ID', identifierUsed: 'LOCAL_VERIFICATION' });
    expect(deriveRegistrationTier({ ...base, idType: 'VOTER_ID', hasLocalVerification: true }).tier).toBe('STANDARD');
  });
  it('falls back to standard identified by phone alone', () => {
    expect(deriveRegistrationTier(base)).toEqual({ tier: 'STANDARD', identifierUsed: 'PHONE_ONLY' });
  });
});
