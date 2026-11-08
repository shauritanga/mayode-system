import { BadRequestException } from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { idTypeFromDocument, normalizeIdentity } from './farmer-identity';

describe('farmer identity', () => {
  it('accepts a NIDA number with or without dashes and keeps it as the national ID', () => {
    expect(normalizeIdentity('NIDA', '19900101-12345-00001-23')).toEqual({ idType: 'NIDA', idNumber: '19900101123450000123', nationalId: '19900101123450000123' });
    expect(normalizeIdentity('NIDA', ' 19900101 12345 00001 23 ').idNumber).toBe('19900101123450000123');
  });
  it('rejects a NIDA number that is not 20 digits', () => {
    expect(() => normalizeIdentity('NIDA', '12345')).toThrow(BadRequestException);
    expect(() => normalizeIdentity('NIDA', '1990010112345000012A')).toThrow(BadRequestException);
  });
  it('accepts voter IDs and driver\'s licenses without touching the NIDA field', () => {
    expect(normalizeIdentity('VOTER_ID', 't-1234-5678-9012-3')).toEqual({ idType: 'VOTER_ID', idNumber: 'T-1234-5678-9012-3', nationalId: null });
    expect(normalizeIdentity('DRIVER_LICENSE', '4001234567')).toEqual({ idType: 'DRIVER_LICENSE', idNumber: '4001234567', nationalId: null });
  });
  it('rejects empty, too short, too long or odd-character numbers', () => {
    expect(() => normalizeIdentity('VOTER_ID', '   ')).toThrow(/required/);
    expect(() => normalizeIdentity('DRIVER_LICENSE', 'AB12')).toThrow(BadRequestException);
    expect(() => normalizeIdentity('DRIVER_LICENSE', 'A'.repeat(21))).toThrow(BadRequestException);
    expect(() => normalizeIdentity('VOTER_ID', 'AB 12$%^&*')).toThrow(BadRequestException);
  });
  it('maps ID document types to farmer ID types and refuses anything else', () => {
    expect(idTypeFromDocument(DocumentType.NIDA_ID)).toBe('NIDA');
    expect(idTypeFromDocument(DocumentType.VOTER_ID)).toBe('VOTER_ID');
    expect(idTypeFromDocument(DocumentType.DRIVER_LICENSE)).toBe('DRIVER_LICENSE');
    expect(() => idTypeFromDocument(DocumentType.PHOTO)).toThrow(BadRequestException);
  });
});
