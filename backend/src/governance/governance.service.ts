import {
  BadRequestException,
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
  projects() {
    return this.prisma.communityProject.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
  async project(id: string) {
    const project = await this.prisma.communityProject.findUnique({
      where: { id },
    });
    if (!project) throw new NotFoundException('Community project not found');
    return project;
  }
  createProject(data: {
    name: string;
    fundingSource: string;
    budget: number;
    milestones?: unknown;
  }) {
    return this.prisma.communityProject.create({
      data: { ...data, milestones: data.milestones as any },
    });
  }
  updateProject(id: string, dto: UpdateProjectDto) {
    return this.prisma.communityProject.update({
      where: { id },
      data: {
        spentAmount: dto.spentAmount,
        status: dto.status,
        milestones: dto.milestones as any,
      },
    });
  }
  async removeProject(id: string) {
    await this.project(id);
    return this.prisma.communityProject.delete({ where: { id } });
  }
  meetings() {
    return this.prisma.meetingRecord.findMany({
      include: { votes: true },
      orderBy: { meetingDate: 'desc' },
    });
  }
  async report() {
    const meetings = await this.prisma.meetingRecord.findMany({
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
  }) {
    return this.prisma.meetingRecord.create({
      data: { ...data, meetingDate: new Date(data.meetingDate) },
    });
  }
  createVote(data: {
    title: string;
    description?: string;
    opensAt: string;
    closesAt: string;
    meetingId?: string;
    options: string[];
  }) {
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
    return this.prisma.vote.create({
      data: {
        ...data,
        opensAt: new Date(data.opensAt),
        closesAt: new Date(data.closesAt),
        options: { create: options.map((label) => ({ label })) },
      },
      include: { options: true },
    });
  }
  listVotes() {
    return this.prisma.vote.findMany({
      include: {
        options: { include: { _count: { select: { responses: true } } } },
        _count: { select: { responses: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
    if (!vote.options.some((o) => o.id === optionId))
      throw new BadRequestException('Option does not belong to this vote');
    return this.prisma.voteResponse.create({
      data: { voteId, optionId, farmerId: farmer.id },
    });
  }
  async results(voteId: string) {
    const vote = await this.prisma.vote.findUnique({
      where: { id: voteId },
      include: {
        options: { include: { _count: { select: { responses: true } } } },
        _count: { select: { responses: true } },
      },
    });
    if (!vote) throw new NotFoundException('Vote not found');
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
  async openVote(id: string) {
    const current = await this.prisma.vote.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vote not found');
    if (current.status !== 'DRAFT')
      throw new BadRequestException('Only a draft vote can be opened');
    const vote = await this.prisma.vote.update({
      where: { id },
      data: { status: 'OPEN' },
    });
    const farmers = await this.prisma.farmer.findMany({
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
  async closeVote(id: string) {
    const current = await this.prisma.vote.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Vote not found');
    if (current.status !== 'OPEN')
      throw new BadRequestException('Only an open vote can be closed');
    return this.prisma.vote.update({
      where: { id },
      data: { status: 'CLOSED' },
    });
  }
}
