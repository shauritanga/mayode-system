import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { permissions: true, users: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      systemRole: r.systemRole,
      isActive: r.isActive,
      permissionCount: r._count.permissions,
      userCount: r._count.users,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { resource: true } },
        _count: { select: { users: true } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A role with this name already exists');
    return this.prisma.role.create({
      data: { name: dto.name, description: dto.description },
    });
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be edited');
    }
    if (dto.name && dto.name !== role.name) {
      const existing = await this.prisma.role.findUnique({ where: { name: dto.name } });
      if (existing) throw new ConflictException('A role with this name already exists');
    }
    return this.prisma.role.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    if (role._count.users > 0) {
      throw new ConflictException(
        'This role is still assigned to staff members; reassign them before deleting it',
      );
    }
    await this.prisma.role.delete({ where: { id } });
    return { success: true };
  }

  async getPermissions(id: string) {
    const role = await this.findOne(id);
    const resources = await this.prisma.resource.findMany({ orderBy: { label: 'asc' } });
    return resources.map((resource) => ({
      resourceKey: resource.key,
      resourceLabel: resource.label,
      actions: role.permissions
        .filter((p) => p.resourceId === resource.id)
        .map((p) => p.action),
    }));
  }

  async setPermissions(id: string, dto: SetRolePermissionsDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new BadRequestException('System roles do not use the custom permission matrix');
    }

    const resources = await this.prisma.resource.findMany();
    const resourceByKey = new Map(resources.map((r) => [r.key, r]));

    const rows: { roleId: string; resourceId: string; action: string }[] = [];
    for (const entry of dto.permissions) {
      const resource = resourceByKey.get(entry.resourceKey);
      if (!resource) {
        throw new BadRequestException(`Unknown resource: ${entry.resourceKey}`);
      }
      for (const action of entry.actions) {
        rows.push({ roleId: id, resourceId: resource.id, action });
      }
    }

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: id } }),
      ...(rows.length
        ? [this.prisma.rolePermission.createMany({ data: rows as any })]
        : []),
    ]);

    return this.getPermissions(id);
  }

  async getResources() {
    return this.prisma.resource.findMany({ orderBy: { label: 'asc' } });
  }
}
