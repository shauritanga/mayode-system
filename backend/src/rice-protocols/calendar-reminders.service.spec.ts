import { CalendarRemindersService } from './calendar-reminders.service';
import { missedMessage, reminderMessage, toLang } from './calendar-messages';

const DAY = 86_400_000;
// Mid-morning on 5 March 2026 in Tanzania
const NOW = new Date('2026-03-05T04:00:00Z');
const at = (days: number) => new Date(NOW.getTime() + days * DAY);

function setup(
  tasks: any[],
  settings = { reminderLeadDays: 1, missedGraceDays: 1, reminderBySms: true },
) {
  const rows = tasks.map((t, i) => ({
    id: `t${i}`,
    cropCycleId: 'c1',
    title: 'Weed the field',
    status: 'PENDING',
    reminderSentAt: null,
    ...t,
    cropCycle: {
      id: 'c1',
      status: 'ACTIVE',
      farm: { farmCode: 'FP-01' },
      farmer: {
        user: {
          id: 'u1',
          phone: '+255700000001',
          language: t.language ?? 'sw',
        },
      },
    },
  }));
  const prisma: any = {
    riceCalendarTask: {
      findMany: jest.fn(async ({ where }: any) =>
        rows.filter(
          (r) =>
            r.status === where.status &&
            (where.reminderSentAt === null ? r.reminderSentAt === null : true),
        ),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const r = rows.find((x) => x.id === where.id);
        if (
          !r ||
          r.status !== where.status ||
          (where.reminderSentAt === null && r.reminderSentAt)
        )
          return { count: 0 };
        Object.assign(r, data);
        return { count: 1 };
      }),
    },
  };
  const notifications: any = { create: jest.fn() };
  const sms: any = { send: jest.fn() };
  const settingsSvc: any = {
    getCalendarSettings: jest.fn().mockResolvedValue(settings),
  };
  return {
    service: new CalendarRemindersService(
      prisma,
      notifications,
      sms,
      settingsSvc,
    ),
    rows,
    notifications,
    sms,
  };
}

describe('Reminders before an activity is due', () => {
  it('reminds a farmer the day before, once, by app and SMS, in Swahili by default', async () => {
    const { service, notifications, sms, rows } = setup([{ dueDate: at(1) }]);
    expect(await service.sendReminders(NOW)).toBe(1);
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        type: 'rice.task.reminder',
        title: expect.stringContaining('Kesho'),
        data: { cropCycleId: 'c1', taskId: 't0' },
      }),
    );
    expect(sms.send).toHaveBeenCalledWith(
      '+255700000001',
      expect.stringContaining('Kesho'),
      'rice_task_reminder',
    );
    expect(rows[0].reminderSentAt).toEqual(NOW);
    // a second run the same day sends nothing more
    expect(await service.sendReminders(NOW)).toBe(0);
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('speaks English to farmers who chose English, and leaves far-off or finished activities alone', async () => {
    const { service, notifications } = setup([
      { dueDate: at(1), language: 'en' },
      { dueDate: at(5) },
      { dueDate: at(1), status: 'COMPLETED' },
    ]);
    expect(await service.sendReminders(NOW)).toBe(1);
    expect(notifications.create.mock.calls[0][0].title).toBe(
      'Tomorrow: Weed the field',
    );
  });

  it('skips the SMS when the admin has turned it off, but still notifies in the app', async () => {
    const { service, notifications, sms } = setup([{ dueDate: at(1) }], {
      reminderLeadDays: 1,
      missedGraceDays: 1,
      reminderBySms: false,
    });
    await service.sendReminders(NOW);
    expect(notifications.create).toHaveBeenCalledTimes(1);
    expect(sms.send).not.toHaveBeenCalled();
  });
});

describe('Marking activities as missed', () => {
  it('marks an activity missed a day after it was due and tells the farmer once', async () => {
    const { service, rows, notifications, sms } = setup([{ dueDate: at(-1) }]);
    expect(await service.markMissed(NOW)).toBe(1);
    expect(rows[0]).toMatchObject({
      status: 'MISSED',
      missedAt: NOW,
      missedNotifiedAt: NOW,
    });
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'rice.task.missed',
        title: expect.stringContaining('Haijafanyika'),
      }),
    );
    expect(sms.send).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'rice_task_missed',
    );
    expect(await service.markMissed(NOW)).toBe(0);
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });

  it('does not mark an activity that is only due today, or that was already done', async () => {
    const { service, rows } = setup([
      { dueDate: at(0) },
      { dueDate: at(-3), status: 'COMPLETED' },
    ]);
    expect(await service.markMissed(NOW)).toBe(0);
    expect(rows.map((r) => r.status)).toEqual(['PENDING', 'COMPLETED']);
  });

  it('respects a longer grace period set by the admin', async () => {
    const { service } = setup([{ dueDate: at(-2) }], {
      reminderLeadDays: 1,
      missedGraceDays: 3,
      reminderBySms: true,
    });
    expect(await service.markMissed(NOW)).toBe(0);
  });

  it('records old overdue work as missed but does not message the farmer about it', async () => {
    const { service, rows, notifications, sms } = setup([{ dueDate: at(-60) }]);
    expect(await service.markMissed(NOW)).toBe(1);
    expect(rows[0].status).toBe('MISSED');
    expect(rows[0].missedNotifiedAt).toBeUndefined();
    expect(notifications.create).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });
});

describe('Message wording', () => {
  it("picks the farmer's language, defaulting to Swahili", () => {
    expect(toLang('en')).toBe('en');
    expect(toLang('sw')).toBe('sw');
    expect(toLang(undefined)).toBe('sw');
    expect(
      reminderMessage({
        lang: 'en',
        title: 'Weed',
        farmCode: 'F1',
        daysAhead: 0,
      }).title,
    ).toBe('Today: Weed');
    expect(
      reminderMessage({
        lang: 'sw',
        title: 'Weed',
        farmCode: 'F1',
        daysAhead: 0,
      }).title,
    ).toBe('Leo: Weed');
    expect(
      missedMessage({
        lang: 'en',
        title: 'Weed',
        farmCode: 'F1',
        dueDate: new Date('2026-03-05T07:00:00Z'),
      }).body,
    ).toContain('05/03/2026');
  });
});
