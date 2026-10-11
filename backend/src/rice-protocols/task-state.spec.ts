import {
  eatDay,
  isBackdated,
  isDueForReminder,
  isMissed,
  lateByDays,
  taskView,
} from './task-state';

// 5 Mar 2026, 10:00 East Africa Time == 07:00 UTC
const due = new Date('2026-03-05T07:00:00Z');
const at = (iso: string) => new Date(iso);

describe('East Africa calendar days', () => {
  it('a late-evening Tanzanian time still belongs to that Tanzanian day', () => {
    // 23:30 EAT on the 5th is 20:30 UTC on the 5th; 00:30 EAT on the 6th is 21:30 UTC on the 5th.
    expect(eatDay(at('2026-03-05T20:30:00Z'))).toBe(eatDay(due));
    expect(eatDay(at('2026-03-05T21:30:00Z'))).toBe(eatDay(due) + 1);
  });
});

describe('How an activity is shown', () => {
  const pending = { status: 'PENDING', dueDate: due };

  it('upcoming, then due soon, then overdue, then missed', () => {
    expect(taskView(pending, at('2026-03-01T08:00:00Z'))).toBe('UPCOMING');
    expect(taskView(pending, at('2026-03-04T08:00:00Z'))).toBe('DUE_SOON'); // tomorrow
    expect(taskView(pending, at('2026-03-05T08:00:00Z'))).toBe('DUE_SOON'); // due today
    expect(taskView(pending, at('2026-03-06T08:00:00Z'))).toBe('OVERDUE');
    expect(
      taskView({ ...pending, status: 'MISSED' }, at('2026-03-08T08:00:00Z')),
    ).toBe('MISSED');
  });

  it('done on the due day is on time, whatever the hour', () => {
    expect(
      taskView({
        status: 'COMPLETED',
        dueDate: due,
        completedAt: at('2026-03-05T20:00:00Z'),
      }),
    ).toBe('ON_TIME');
    expect(
      taskView({
        status: 'COMPLETED',
        dueDate: due,
        completedAt: at('2026-03-03T08:00:00Z'),
      }),
    ).toBe('ON_TIME');
  });

  it('done after the due day is late, even if never flagged missed; a completed task that was missed stays late', () => {
    expect(
      taskView({
        status: 'COMPLETED',
        dueDate: due,
        completedAt: at('2026-03-07T08:00:00Z'),
      }),
    ).toBe('LATE');
    expect(
      lateByDays({
        status: 'COMPLETED',
        dueDate: due,
        completedAt: at('2026-03-07T08:00:00Z'),
      }),
    ).toBe(2);
    expect(
      taskView({
        status: 'COMPLETED',
        dueDate: due,
        completedAt: at('2026-03-05T08:00:00Z'),
        missedAt: at('2026-03-06T08:00:00Z'),
      }),
    ).toBe('LATE');
  });

  it('lateness is zero for on-time or unfinished work', () => {
    expect(
      lateByDays({
        status: 'COMPLETED',
        dueDate: due,
        completedAt: at('2026-03-04T08:00:00Z'),
      }),
    ).toBe(0);
    expect(lateByDays({ status: 'PENDING', dueDate: due })).toBe(0);
  });
});

describe('When the system acts', () => {
  const pending = { status: 'PENDING', dueDate: due };

  it('reminds the day before and on the day, but not after it or too early', () => {
    expect(isDueForReminder(pending, at('2026-03-03T04:00:00Z'), 1)).toBe(
      false,
    );
    expect(isDueForReminder(pending, at('2026-03-04T04:00:00Z'), 1)).toBe(true);
    expect(isDueForReminder(pending, at('2026-03-05T04:00:00Z'), 1)).toBe(true);
    expect(isDueForReminder(pending, at('2026-03-06T04:00:00Z'), 1)).toBe(
      false,
    );
    expect(
      isDueForReminder(
        { ...pending, status: 'COMPLETED' },
        at('2026-03-04T04:00:00Z'),
        1,
      ),
    ).toBe(false);
    expect(isDueForReminder(pending, at('2026-03-02T04:00:00Z'), 3)).toBe(true);
  });

  it('marks missed one day after the due day (with the default grace) and never earlier', () => {
    expect(isMissed(pending, at('2026-03-05T20:00:00Z'), 1)).toBe(false);
    expect(isMissed(pending, at('2026-03-06T04:00:00Z'), 1)).toBe(true);
    expect(isMissed(pending, at('2026-03-06T04:00:00Z'), 3)).toBe(false);
    expect(
      isMissed(
        { ...pending, status: 'COMPLETED' },
        at('2026-03-09T04:00:00Z'),
        1,
      ),
    ).toBe(false);
    expect(
      isMissed({ ...pending, status: 'MISSED' }, at('2026-03-09T04:00:00Z'), 1),
    ).toBe(false);
  });
});

describe('Backdated completions are visible', () => {
  it('flags a completion date more than a week before the server received it', () => {
    expect(
      isBackdated({
        completedAt: at('2026-03-01T08:00:00Z'),
        recordedAt: at('2026-03-20T08:00:00Z'),
      }),
    ).toBe(true);
    expect(
      isBackdated({
        completedAt: at('2026-03-14T08:00:00Z'),
        recordedAt: at('2026-03-20T08:00:00Z'),
      }),
    ).toBe(false);
    expect(isBackdated({ completedAt: at('2026-03-14T08:00:00Z') })).toBe(
      false,
    );
  });
});
