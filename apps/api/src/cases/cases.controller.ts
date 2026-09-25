import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { ZodPipe } from '../common/http/response';
import { AuthUser, CurrentUser, RequirePermissions } from '../rbac/auth-user';
import { CasesService } from './cases.service';
import { assignSchema, changeStatusSchema, createCaseSchema, createNoteSchema, listCasesQuery, updateCaseSchema } from './cases.schemas';
import { TimelineService } from './timeline.service';

const uuid = () => new ParseUUIDPipe();

/**
 * Patients and staff share these routes; the service derives what each may see from the
 * token (ownership for patients, assignment/permission scope for staff). IDs alone grant nothing.
 */
@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post()
  create(@CurrentUser() u: AuthUser, @Body(new ZodPipe(createCaseSchema)) dto: z.infer<typeof createCaseSchema>, @Ctx() ctx: ReqCtx) {
    return this.cases.create(u, dto, ctx);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listCasesQuery)) q: z.infer<typeof listCasesQuery>) {
    return this.cases.list(u, q);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    return this.cases.get(u, id, ctx);
  }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(updateCaseSchema)) dto: z.infer<typeof updateCaseSchema>, @Ctx() ctx: ReqCtx) {
    return this.cases.update(u, id, dto, ctx);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    return this.cases.cancelOwn(u, id, ctx);
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions('cases.edit')
  status(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(changeStatusSchema)) dto: z.infer<typeof changeStatusSchema>, @Ctx() ctx: ReqCtx) {
    return this.cases.changeStatus(u, id, dto, ctx);
  }

  @Get(':id/timeline')
  timeline(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) {
    return this.cases.getTimeline(u, id);
  }

  @Get(':id/notes')
  notes(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string) {
    return this.cases.listNotes(u, id);
  }

  @Post(':id/notes')
  @RequirePermissions('cases.edit')
  addNote(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(createNoteSchema)) dto: z.infer<typeof createNoteSchema>, @Ctx() ctx: ReqCtx) {
    return this.cases.addNote(u, id, dto, ctx);
  }

  @Post(':id/assignments')
  @RequirePermissions('cases.assign')
  assign(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(assignSchema)) dto: z.infer<typeof assignSchema>, @Ctx() ctx: ReqCtx) {
    return this.cases.assign(u, id, dto, ctx);
  }

  @Delete(':id/assignments/:assignmentId')
  @HttpCode(204)
  @RequirePermissions('cases.assign')
  async unassign(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Param('assignmentId', uuid()) aid: string, @Ctx() ctx: ReqCtx) {
    await this.cases.unassign(u, id, aid, ctx);
  }
}

@Module({ controllers: [CasesController], providers: [CasesService, TimelineService], exports: [CasesService, TimelineService] })
export class CasesModule {}
