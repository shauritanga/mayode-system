import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import {
  assertWithinCeiling,
  DelegatingActor,
  grantsOf,
  isSuperAdmin,
  PLATFORM_ONLY_RESOURCES,
  requireTenant,
} from '../auth/delegation';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Roles the actor may see: everything for Super Admin, else their own AMCOS's roles. */
  async findAll(actor: DelegatingActor) {
    const roles = await this.prisma.role.findMany({
      where: isSuperAdmin(actor) ? undefined : { mamcosId: requireTenant(actor) },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { permissions: true, users: true } },
        mamcos: { select: { name: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      isActive: r.isActive,
      mamcosId: r.mamcosId,
      mamcosName: r.mamcos?.name ?? null,
      permissionCount: r._count.permissions,
      userCount: r._count.users,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** Loads a role and hides it (404) from actors outside its scope. */
  private async scoped(id: string, actor: DelegatingActor) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { resource: true } },
        _count: { select: { users: true } },
      },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (!isSuperAdmin(actor) && role.mamcosId !== requireTenant(actor)) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  /** A cooperative admin may not alter the role that grants them their own access. */
  private assertNotOwnRole(role: { id: string }, actor: DelegatingActor) {
    if (!isSuperAdmin(actor) && actor.roleId === role.id) {
      throw new ForbiddenException('You cannot change the role you hold yourself; ask Super Admin');
    }
  }

  private async assertNameFree(name: string, mamcosId: string | null, exceptId?: string) {
    const existing = await this.prisma.role.findFirst({
      where: { name, mamcosId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (existing) throw new ConflictException('A role with this name already exists');
  }

  findOne(id: string, actor: DelegatingActor) {
    return this.scoped(id, actor);
  }

  async create(dto: CreateRoleDto, actor: DelegatingActor) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Role name is required');
    let mamcosId: string | null;
    if (isSuperAdmin(actor)) {
      // A cooperative's roles are its administrator's to create; Super Admin defines platform roles only.
      if (dto.mamcosId) {
        throw new BadRequestException('Super Admin creates platform roles only. A cooperative’s roles are created by its administrator.');
      }
      mamcosId = null;
    } else {
      mamcosId = requireTenant(actor);
    }

    await this.assertNameFree(name, mamcosId);
    return this.prisma.role.create({
      data: {
        name,
        description: dto.description,
        systemRole: UserRole.CUSTOM,
        mamcosId,
      },
    });
  }

  async update(id: string, dto: UpdateRoleDto, actor: DelegatingActor) {
    const role = await this.scoped(id, actor);
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be edited');
    }
    this.assertNotOwnRole(role, actor);
    const name = dto.name?.trim();
    if (name && name !== role.name) await this.assertNameFree(name, role.mamcosId, id);
    return this.prisma.role.update({ where: { id }, data: { ...dto, ...(name ? { name } : {}) } });
  }

  async remove(id: string, actor: DelegatingActor) {
    const role = await this.scoped(id, actor);
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    this.assertNotOwnRole(role, actor);
    if (role._count.users > 0) {
      throw new ConflictException(
        'This role is still assigned to staff members; reassign them before deleting it',
      );
    }
    await this.prisma.role.delete({ where: { id } });
    return { success: true };
  }

  /** Resources the actor may see in a permission matrix. */
  private async visibleResources(actor: DelegatingActor) {
    const all = await this.prisma.resource.findMany({ orderBy: { label: 'asc' } });
    if (isSuperAdmin(actor)) return all;
    // Cooperative admins only see what they could actually grant.
    const held = new Set(grantsOf(actor).map((g) => g.resource));
    return all.filter(
      (r) => held.has(r.key) && !(PLATFORM_ONLY_RESOURCES as readonly string[]).includes(r.key),
    );
  }

  async getPermissions(id: string, actor: DelegatingActor) {
    const role = await this.scoped(id, actor);
    const resources = await this.visibleResources(actor);
    return resources.map((resource) => ({
      resourceKey: resource.key,
      resourceLabel: resource.label,
      actions: role.permissions
        .filter((p) => p.resourceId === resource.id)
        .map((p) => p.action),
    }));
  }

  async setPermissions(id: string, dto: SetRolePermissionsDto, actor: DelegatingActor) {
    const role = await this.scoped(id, actor);
    if (role.isSystem) {
      throw new BadRequestException('System roles do not use the custom permission matrix');
    }
    this.assertNotOwnRole(role, actor);

    const resources = await this.prisma.resource.findMany();
    const resourceByKey = new Map(resources.map((r) => [r.key, r]));

    const rows: { roleId: string; resourceId: string; action: string }[] = [];
    const wanted: { resource: string; action: string }[] = [];
    for (const entry of dto.permissions) {
      const resource = resourceByKey.get(entry.resourceKey);
      if (!resource) {
        throw new BadRequestException(`Unknown resource: ${entry.resourceKey}`);
      }
      for (const action of entry.actions) {
        rows.push({ roleId: id, resourceId: resource.id, action });
        wanted.push({ resource: entry.resourceKey, action });
      }
    }
    // A cooperative admin can never give a role more than they hold themselves.
    assertWithinCeiling(actor, wanted);

    // A cooperative admin replaces only the part of the matrix they can see; grants on
    // resources outside their view (set by Super Admin) are left untouched.
    const editable = isSuperAdmin(actor) ? null : (await this.visibleResources(actor)).map((r) => r.id);
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: editable ? { roleId: id, resourceId: { in: editable } } : { roleId: id },
      }),
      ...(rows.length
        ? [this.prisma.rolePermission.createMany({ data: rows as any })]
        : []),
    ]);

    return this.getPermissions(id, actor);
  }

  getResources(actor: DelegatingActor) {
    return this.visibleResources(actor);
  }
}
