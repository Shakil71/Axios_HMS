import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { ZodPipe } from '../common/http/response';
import { AuthUser, CurrentUser, RequirePermissions } from '../rbac/auth-user';
import { PatientsService } from './patients.service';
import { createFamilyMemberSchema, listPatientsQuery, updateFamilyMemberSchema, updateProfileSchema } from './patients.schemas';
import { z } from 'zod';

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  // Patient (self-service). Ownership is derived from the token, never from a URL id.
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.patients.getMine(user);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body(new ZodPipe(updateProfileSchema)) dto: z.infer<typeof updateProfileSchema>, @Ctx() ctx: ReqCtx) {
    return this.patients.updateMine(user, dto, ctx);
  }

  @Get('me/family-members')
  family(@CurrentUser() user: AuthUser) {
    return this.patients.listFamily(user);
  }

  @Post('me/family-members')
  createFamily(@CurrentUser() user: AuthUser, @Body(new ZodPipe(createFamilyMemberSchema)) dto: z.infer<typeof createFamilyMemberSchema>, @Ctx() ctx: ReqCtx) {
    return this.patients.createFamily(user, dto, ctx);
  }

  @Patch('me/family-members/:id')
  updateFamily(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateFamilyMemberSchema)) dto: z.infer<typeof updateFamilyMemberSchema>,
    @Ctx() ctx: ReqCtx,
  ) {
    return this.patients.updateFamily(user, id, dto, ctx);
  }

  @Delete('me/family-members/:id')
  @HttpCode(204)
  async deleteFamily(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: ReqCtx) {
    await this.patients.deleteFamily(user, id, ctx);
  }

  // Staff. Permission at the door, object-level scope inside the service.
  @Get()
  @RequirePermissions('patients.view')
  list(@CurrentUser() user: AuthUser, @Query(new ZodPipe(listPatientsQuery)) q: z.infer<typeof listPatientsQuery>) {
    return this.patients.list(user, q);
  }

  @Get(':id')
  @RequirePermissions('patients.view')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: ReqCtx) {
    return this.patients.getForStaff(user, id, ctx);
  }
}

@Module({ controllers: [PatientsController], providers: [PatientsService], exports: [PatientsService] })
export class PatientsModule {}
