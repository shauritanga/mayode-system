import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService, RequestUser } from '../common/ownership.service';
import { SmsService } from '../messaging/sms.service';
import { UpdateProjectDto } from './dto/update-project.dto';
@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly sms: SmsService,
  ) {}
  private scope(user?: RequestUser) {
    if (!user || user.role === 'SUPER_ADMIN') return {};
    if (user.mamcosId) return { OR: [{ mamcosId: user.mamcosId }, { mamcosId: null }] };
    return { mamcosId: null };
  }
  private assertScope(record: { mamcosId?: string | null }, user?: RequestUser, write = false) {
    if (!user || user.role === 'SUPER_ADMIN') return;
    if ((record.mamcosId && record.mamcosId !== user.mamcosId) ||
        (write && !record.mamcosId && !!user.mamcosId)) {
      throw new ForbiddenException('This record belongs to another governance workspace');
    }
  }
  projects(user?: RequestUser) {
    return this.prisma.communityProject.findMany({
      where: this.scope(user),
      orderBy: { createdAt: 'desc' },
    });
  }
  async project(id: string, user?: RequestUser) {
    const project = await this.prisma.communityProject.findUnique({
      where: { id },
    });
    if (!project) throw new NotFoundException('Community project not found');
    this.assertScope(project, user);
    return project;
  }
  createProject(data: {
    name: string;
    fundingSource: string;
    budget: number;
    milestones?: unknown;
  }, user?: RequestUser) {
    return this.prisma.communityProject.create({
      data: { ...data, mamcosId: user?.mamcosId ?? null, milestones: data.milestones as any },
    });
  }
  async updateProject(id: string, dto: UpdateProjectDto, user?: RequestUser) {
    this.assertScope(await this.project(id, user), user, true);
    return this.prisma.communityProject.update({
      where: { id },
      data: {
        spentAmount: dto.spentAmount,
        status: dto.status,
        milestones: dto.milestones as any,
      },
    });
  }
  async removeProject(id: string, user?: RequestUser) {
    this.assertScope(await this.project(id, user), user, true);
    return this.prisma.communityProject.delete({ where: { id } });
  }
  meetings(user?: RequestUser) {
    return this.prisma.meetingRecord.findMany({
      where: this.scope(user),
      include: { votes: true },
      orderBy: { meetingDate: 'desc' },
    });
  }
  async report(user?: RequestUser) {
    const meetings = await this.prisma.meetingRecord.findMany({
      where: this.scope(user),
      include: {
        votes: {
          include: {
            options: { include: { _count: { select: { responses: true } } } },
            _count: { select: { responses: true } },
          },
        },
      },
      orderBy: { meetingDate: 'desc' },
    });
    return {
      generatedAt: new Date(),
      meetings: meetings.map((meeting) => ({
        ...meeting,
        votes: meeting.votes.map((vote) => ({
          ...vote,
          results: vote.options.map((option) => ({
            optionId: option.id,
            label: option.label,
            votes: option._count.responses,
            percent: vote._count.responses
              ? (option._count.responses / vote._count.responses) * 100
              : 0,
          })),
        })),
      })),
    };
  }
  createMeeting(data: {
    meetingDate: string;
    agenda: string;
    decisions: string;
    attendeeCount: number;
  }, user?: RequestUser) {
    return this.prisma.meetingRecord.create({
      data: { ...data, mamcosId: user?.mamcosId ?? null, meetingDate: new Date(data.meetingDate) },
    });
  }
  createVote(data: {
    title: string;
    description?: string;
    opensAt: string;
    closesAt: string;
    meetingId?: string;
    options: string[];
  }, user?: RequestUser) {
    const options = data.options.map((label) => label.trim()).filter(Boolean);
    if (options.length < 2)
      throw new BadRequestException('A vote needs at least two options');
    if (
      new Set(options.map((label) => label.toLowerCase())).size !==
      options.length
    )
      throw new BadRequestException('Vote options must be unique');
    if (new Date(data.closesAt) <= new Date(data.opensAt))
      throw new BadRequestException(
        'Vote closing time must be after opening time',
      );
    return this.persistVote(data, options, user);
  }
  private async persistVote(data: { title: string; description?: string; opensAt: string; closesAt: string; meetingId?: string; options: string[] }, options: string[], user?: RequestUser) {
    if (data.meetingId) {
      const meeting = await this.prisma.meetingRecord.findUnique({ where: { id: data.meetingId } });
      if (!meeting) throw new NotFoundException("Meeting not found");
      this.assertScope(meeting, user, true);
      if ((meeting.mamcosId ?? null) !== (user?.mamcosId ?? null)) throw new BadRequestException("Vote and meeting must belong to the same workspace");
    }
    return this.prisma.vote.create({
      data: {
        ...data,
        mamcosId: user?.mamcosId ?? null,
        opensAt: new Date(data.opensAt),
        closesAt: new Date(data.closesAt),
        options: { create: options.map((label) => ({ label })) },
      },
      include: { options: true },
    });
  }
  async listVotes(user?: RequestUser) {
    const farmer = user ? await this.prisma.farmer.findUnique({ where: { userId: user.id }, select: { id: true } }) : null;
    const votes = await this.prisma.vote.findMany({
      where: { ...this.scope(user), ...(user?.role === 'FARMER' ? { status: { not: 'DRAFT' as const } } : {}) },
      include: {
        options: { include: { _count: { select: { responses: true } } } },
        _count: { select: { responses: true } },
        responses: { where: { farmerId: farmer?.id ?? '__no_farmer__' }, select: { optionId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return votes.map(({ responses, ...vote }) => ({ ...vote, myOptionId: responses[0]?.optionId ?? null }));
  }
  async respond(voteId: string, optionId: string, user: RequestUser) {
    const farmer = await this.prisma.farmer.findUnique({
      where: { userId: user.id },
    });
    if (!farmer)
      throw new BadRequestException('A farmer profile is required to vote');
    const vote = await this.prisma.vote.findUnique({
      where: { id: voteId },
      include: { options: true },
    });
    if (
      !vote ||
      vote.status !== 'OPEN' ||
      vote.opensAt > new Date() ||
      vote.closesAt < new Date()
    )
      throw new BadRequestException('Voting is not open');
    this.assertScope(vote, { ...user, mamcosId: farmer.mamcosId });
    const existing = await this.prisma.voteResponse.findUnique({ where: { voteId_farmerId: { voteId, farmerId: farmer.id } } });
    if (existing) throw new BadRequestException('You have already voted on this decision');
    if (!vote.options.some((o) => o.id === optionId))
      throw new BadRequestException('Option does not belong to this vote');
    return this.prisma.voteResponse.create({
      data: { voteId, optionId, farmerId: farmer.id },
    });
  }
  async results(voteId: string, user?: RequestUser) {
    const vote = await this.prisma.vote.findUnique({
      where: { id: voteId },
      include: {
        options: { include: { _count: { select: { responses: true } } } },
        _count: { select: { responses: true } },
      },
    });
    if (!vote) throw new NotFoundException('Vote not found');
    this.assertScope(vote, user);
    return {
      ...vote,
      results: vote.options.map((o) => ({
        optionId: o.id,
        label: o.label,
        votes: o._count.responses,
        percent: vote._count.responses
          ? (o._count.responses / vote._count.responses) * 100
          : 0,
      })),
    };
  }
  async openVote(id: string, user?: RequestUser) {
    const current = await this.prisma.vote.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vote not found');
    this.assertScope(current, user, true);
    if (current.status !== 'DRAFT')
      throw new BadRequestException('Only a draft vote can be opened');
    const vote = await this.prisma.vote.update({
      where: { id },
      data: { status: 'OPEN' },
    });
    const farmers = await this.prisma.farmer.findMany({
      where: current.mamcosId ? { mamcosId: current.mamcosId } : {},
      include: { user: { select: { phone: true } } },
    });
    await Promise.all(
      farmers.map((farmer) =>
        this.sms.send(
          farmer.user.phone,
          `MAYODE: Voting is open — ${vote.title}. Please open the MAYODE app to vote before ${vote.closesAt.toLocaleDateString()}.`,
          'vote_announcement',
        ),
      ),
    );
    return vote;
  }
  async closeVote(id: string, user?: RequestUser) {
    const current = await this.prisma.vote.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vote not found');
    this.assertScope(current, user, true);
    if (current.status !== 'OPEN')
      throw new BadRequestException('Only an open vote can be closed');
    return this.prisma.vote.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  }
}
