import { BadRequestException } from '@nestjs/common';
import { DocumentType, FarmerIdType } from '@prisma/client';

export interface FarmerIdentity {
  idType: FarmerIdType;
  /** Normalised number (digits only for NIDA; upper-case without spaces otherwise). */
  idNumber: string;
  /** Set only for NIDA, so national referencing keeps working. */
  nationalId: string | null;
}

/** The ID document types a farmer can submit, and the farmer ID type each one establishes. */
export const ID_DOCUMENT_TYPES = [DocumentType.NIDA_ID, DocumentType.VOTER_ID, DocumentType.DRIVER_LICENSE] as const;
const FROM_DOCUMENT: Record<string, FarmerIdType> = {
  [DocumentType.NIDA_ID]: FarmerIdType.NIDA,
  [DocumentType.VOTER_ID]: FarmerIdType.VOTER_ID,
  [DocumentType.DRIVER_LICENSE]: FarmerIdType.DRIVER_LICENSE,
};

export function idTypeFromDocument(type: DocumentType): FarmerIdType {
  const mapped = FROM_DOCUMENT[type];
  if (!mapped) throw new BadRequestException('ID type must be NIDA, voter ID or driver\'s license');
  return mapped;
}

const LABEL: Record<FarmerIdType, string> = {
  NIDA: 'NIDA number',
  VOTER_ID: 'Voter ID number',
  DRIVER_LICENSE: 'Driver\'s license number',
};

/** Validates and normalises an ID number for its type. NIDA is 20 digits (dashes and spaces allowed). */
export function normalizeIdentity(idType: FarmerIdType, rawNumber: string): FarmerIdentity {
  const raw = (rawNumber ?? '').trim();
  if (!raw) throw new BadRequestException(`${LABEL[idType]} is required`);
  if (idType === FarmerIdType.NIDA) {
    const digits = raw.replace(/[\s-]/g, '');
    if (!/^\d{20}$/.test(digits)) throw new BadRequestException('A NIDA number has 20 digits, for example 19900101-12345-00001-23');
    return { idType, idNumber: digits, nationalId: digits };
  }
  const value = raw.replace(/\s+/g, '').toUpperCase();
  const max = idType === FarmerIdType.VOTER_ID ? 25 : 20;
  if (!/^[A-Z0-9][A-Z0-9/-]*$/.test(value) || value.length < 6 || value.length > max)
    throw new BadRequestException(`${LABEL[idType]} must be 6 to ${max} letters, digits, dashes or slashes`);
  return { idType, idNumber: value, nationalId: null };
}
