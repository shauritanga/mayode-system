import { BadRequestException } from '@nestjs/common';
import { GovernanceService } from './governance.service';

describe('GovernanceService', () => {
  const prisma = {
    vote: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    farmer: { findMany: jest.fn() },
    meetingRecord: { findMany: jest.fn() },
  } as any;
  const sms = { send: jest.fn() } as any;
  const service = new GovernanceService(prisma, {} as any, sms);

  beforeEach(() => jest.clearAllMocks());

  it('rejects a vote whose closing time is before its opening time', async () => {
    expect(() =>
      service.createVote({
        title: 'Invalid',
        opensAt: '2026-01-02T00:00:00.000Z',
        closesAt: '2026-01-01T00:00:00.000Z',
        options: ['Yes'],
      }),
    ).toThrow(BadRequestException);
    expect(prisma.vote.create).not.toHaveBeenCalled();
  });

  it('opens a vote and announces it to every farmer phone number', async () => {
    prisma.vote.findUnique.mockResolvedValue({ id: 'vote-1', status: 'DRAFT' });
    prisma.vote.update.mockResolvedValue({
      id: 'vote-1',
      title: 'Approve plan',
      closesAt: new Date('2026-02-01'),
    });
    prisma.farmer.findMany.mockResolvedValue([
      { user: { phone: '+255700000001' } },
      { user: { phone: '+255700000002' } },
    ]);
    await service.openVote('vote-1');
    expect(sms.send).toHaveBeenCalledTimes(2);
    expect(sms.send).toHaveBeenCalledWith(
      '+255700000001',
      expect.stringContaining('Approve plan'),
      'vote_announcement',
    );
  });

  it('does not reopen a closed vote', async () => {
    prisma.vote.findUnique.mockResolvedValue({
      id: 'vote-1',
      status: 'CLOSED',
    });
    await expect(service.openVote('vote-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.vote.update).not.toHaveBeenCalled();
  });

  it('builds a meeting governance report with per-option results', async () => {
    prisma.meetingRecord.findMany.mockResolvedValue([
      {
        id: 'meeting-1',
        votes: [
          {
            id: 'vote-1',
            _count: { responses: 4 },
            options: [
              { id: 'yes', label: 'Yes', _count: { responses: 3 } },
              { id: 'no', label: 'No', _count: { responses: 1 } },
            ],
          },
        ],
      },
    ]);
    const report = await service.report();
    expect(report.meetings[0].votes[0].results).toEqual([
      { optionId: 'yes', label: 'Yes', votes: 3, percent: 75 },
      { optionId: 'no', label: 'No', votes: 1, percent: 25 },
    ]);
  });
});
