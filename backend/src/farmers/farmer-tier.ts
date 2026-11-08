import { FarmerIdType } from '@prisma/client';

export type RegistrationTier = 'STANDARD' | 'FAMILY' | 'ALTERNATIVE_ID';
export type IdentifierUsed = FarmerIdType | 'LOCAL_VERIFICATION' | 'GUARDIAN' | 'PHONE_ONLY';

/**
 * Which of the three registration tiers a farmer is in, worked out from their records so it can never drift:
 *  - FAMILY: the plot they hold is registered in their name but owned by a guardian (a dependent or relative).
 *  - ALTERNATIVE_ID: no NIDA / voter ID / driver's license, but vouched for locally (village letter, local voter ID, chairman).
 *  - STANDARD: everyone else (identified by NIDA or another primary ID, or by phone number alone).
 */
export function deriveRegistrationTier(input: {
  idType: FarmerIdType | null | undefined;
  /** The farmer holds an active allocation that has a guardian. */
  heldThroughGuardian: boolean;
  /** They have a local verification that has not been revoked. */
  hasLocalVerification: boolean;
}): { tier: RegistrationTier; identifierUsed: IdentifierUsed } {
  const { idType, heldThroughGuardian, hasLocalVerification } = input;
  if (heldThroughGuardian) return { tier: 'FAMILY', identifierUsed: 'GUARDIAN' };
  if (idType) return { tier: 'STANDARD', identifierUsed: idType };
  if (hasLocalVerification) return { tier: 'ALTERNATIVE_ID', identifierUsed: 'LOCAL_VERIFICATION' };
  return { tier: 'STANDARD', identifierUsed: 'PHONE_ONLY' };
}
