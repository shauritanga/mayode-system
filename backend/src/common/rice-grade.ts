import { BadRequestException } from '@nestjs/common';

/** Grades are compared ignoring case and repeated spaces, so "Grade 1" and "grade  1" are the same. */
export function gradeKey(grade?: string | null): string {
  return (grade ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cleanGrade(grade?: string | null): string | null {
  const g = (grade ?? '').trim().replace(/\s+/g, ' ');
  return g || null;
}

export function sameGrade(a?: string | null, b?: string | null): boolean {
  return gradeKey(a) === gradeKey(b);
}

/**
 * The single grade of a lot: every record must carry the same grade. `requested` fills in records that
 * were never graded, and must agree with them when they were.
 */
export function resolveLotGrade(
  recordGrades: Array<string | null>,
  requested?: string | null,
): string {
  const graded = recordGrades.map(cleanGrade);
  const distinct = new Map<string, string>();
  for (const g of graded) {
    if (g && !distinct.has(gradeKey(g))) distinct.set(gradeKey(g), g);
  }
  if (distinct.size > 1) {
    throw new BadRequestException(
      `A lot must hold one grade, but these records have ${[...distinct.values()].join(', ')}. Batch each grade into its own lot.`,
    );
  }
  const fromRecords = [...distinct.values()][0] ?? null;
  const asked = cleanGrade(requested);
  if (fromRecords && asked && !sameGrade(fromRecords, asked)) {
    throw new BadRequestException(
      `The records are graded ${fromRecords}, not ${asked}.`,
    );
  }
  const grade = fromRecords ?? asked;
  if (!grade) {
    throw new BadRequestException(
      'These records have no grade. Grade them, or give the lot a grade.',
    );
  }
  if (fromRecords && graded.some((g) => !g)) {
    throw new BadRequestException(
      'Some of these records are ungraded. Grade every record before batching.',
    );
  }
  return grade;
}
