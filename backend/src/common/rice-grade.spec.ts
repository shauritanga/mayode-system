import { BadRequestException } from '@nestjs/common';
import { resolveLotGrade, sameGrade } from './rice-grade';

describe('rice grade', () => {
  it('ignores case and spacing when comparing', () => {
    expect(sameGrade('Grade 1', ' grade  1 ')).toBe(true);
    expect(sameGrade('Grade 1', 'Grade 2')).toBe(false);
  });

  it('takes the shared grade of the records', () => {
    expect(resolveLotGrade(['Grade 1', 'grade 1'])).toBe('Grade 1');
  });

  it('rejects a lot that mixes grades', () => {
    expect(() => resolveLotGrade(['Grade 1', 'Grade 2'])).toThrow(
      BadRequestException,
    );
  });

  it('uses the requested grade only when the records are ungraded', () => {
    expect(resolveLotGrade([null, null], 'Grade 2')).toBe('Grade 2');
    expect(() => resolveLotGrade(['Grade 1'], 'Grade 2')).toThrow(
      BadRequestException,
    );
  });

  it('rejects ungraded records with no requested grade', () => {
    expect(() => resolveLotGrade([null])).toThrow(BadRequestException);
  });

  it('rejects a mix of graded and ungraded records', () => {
    expect(() => resolveLotGrade(['Grade 1', null])).toThrow(
      BadRequestException,
    );
  });
});
