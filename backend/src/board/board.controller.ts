import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../common/ownership.service';
import { BoardService } from './board.service';
import { AddBoardMemberDto, BoardQueryDto, EndBoardMemberDto, UpdateBoardMemberDto } from './dto/board.dto';

@ApiTags('board')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('board-members')
export class BoardController {
  constructor(private readonly board: BoardService) {}

  @Get() @RequirePermission('board_members', 'VIEW')
  list(@CurrentUser() u: RequestUser, @Query() q: BoardQueryDto) { return this.board.list(u, q); }

  @Get('candidates') @RequirePermission('board_members', 'VIEW')
  candidates(@CurrentUser() u: RequestUser, @Query() q: BoardQueryDto) { return this.board.candidates(u, q); }

  @Post() @RequirePermission('board_members', 'CREATE')
  add(@CurrentUser() u: RequestUser, @Body() dto: AddBoardMemberDto, @Query('mamcosId') m?: string) { return this.board.add(u, dto, m); }

  @Patch(':id') @RequirePermission('board_members', 'EDIT')
  update(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: UpdateBoardMemberDto, @Query('mamcosId') m?: string) { return this.board.update(u, id, dto, m); }

  @Post(':id/end') @RequirePermission('board_members', 'EDIT')
  end(@CurrentUser() u: RequestUser, @Param('id') id: string, @Body() dto: EndBoardMemberDto, @Query('mamcosId') m?: string) { return this.board.end(u, id, dto, m); }
}
