import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { PushService } from './push.service';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

/**
 * NotificationsService — persists in-app notifications and, best-effort, pushes
 * them to the recipient's device via Expo. Push is fire-and-forget: it never
 * blocks or fails the in-app enqueue.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  async create(input: CreateNotificationInput) {
    const notification = await this.prisma.notification.create({ data: input });
    const data: Record<string, unknown> = {
      notificationId: notification.id,
      ...(input.data as Record<string, unknown>),
    };
    void this.push
      .sendToUser(input.userId, { title: input.title, body: input.body, data })
      .catch(() => undefined);
    return notification;
  }

  /** Convenience: notify every user holding one of the given roles. */
  async createForRoles(
    roles: Prisma.EnumUserRoleFilter['in'],
    payload: Omit<CreateNotificationInput, 'userId'>,
  ) {
    const users = await this.prisma.user.findMany({
      where: { role: { in: roles }, isActive: true },
      select: { id: true },
    });
    if (users.length === 0) return { count: 0 };
    const result = await this.prisma.notification.createMany({
      data: users.map((u) => ({ ...payload, userId: u.id })),
    });
    void this.push
      .sendToUsers(
        users.map((u) => u.id),
        {
          title: payload.title,
          body: payload.body,
          data: (payload.data as Record<string, unknown>) ?? {},
        },
      )
      .catch(() => undefined);
    return result;
  }

  findForUser(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(id: string, userId: string) {
    const notif = await this.prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== userId) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
