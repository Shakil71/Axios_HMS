import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CasesModule } from '../cases/cases.controller';
import { Ctx, ReqCtx } from '../common/http/request-context';
import { ZodPipe } from '../common/http/response';
import { AuthUser, CurrentUser } from '../rbac/auth-user';
import { DocumentsService } from './documents.service';
import { completeSchema, downloadSchema, listDocumentsQuery, requestUploadSchema, requestVersionSchema, verifySchema } from './documents.schemas';

const uuid = () => new ParseUUIDPipe();

/**
 * No route here is @Public and none returns file bytes. Fine-grained permissions
 * (documents.<action>.<sensitivity>) depend on the document, so they are enforced in the service.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listDocumentsQuery)) q: z.infer<typeof listDocumentsQuery>) {
    return this.docs.list(u, q);
  }

  @Post('uploads')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  requestUpload(@CurrentUser() u: AuthUser, @Body(new ZodPipe(requestUploadSchema)) dto: z.infer<typeof requestUploadSchema>, @Ctx() ctx: ReqCtx) {
    return this.docs.requestUpload(u, dto, ctx);
  }

  @Get(':id')
  get(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    return this.docs.get(u, id, ctx);
  }

  @Post(':id/versions')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  requestVersion(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(requestVersionSchema)) dto: z.infer<typeof requestVersionSchema>, @Ctx() ctx: ReqCtx) {
    return this.docs.requestVersion(u, id, dto, ctx);
  }

  @Get(':id/versions')
  versions(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    return this.docs.versions(u, id, ctx);
  }

  @Post(':id/complete')
  @HttpCode(200)
  complete(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(completeSchema)) dto: z.infer<typeof completeSchema>, @Ctx() ctx: ReqCtx) {
    return this.docs.complete(u, id, dto, ctx);
  }

  @Post(':id/download-url')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  downloadUrl(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(downloadSchema)) dto: z.infer<typeof downloadSchema>, @Ctx() ctx: ReqCtx) {
    return this.docs.downloadUrl(u, id, dto, ctx);
  }

  @Patch(':id/verify')
  verify(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Body(new ZodPipe(verifySchema)) dto: z.infer<typeof verifySchema>, @Ctx() ctx: ReqCtx) {
    return this.docs.verify(u, id, dto, ctx);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() u: AuthUser, @Param('id', uuid()) id: string, @Ctx() ctx: ReqCtx) {
    await this.docs.remove(u, id, ctx);
  }
}

@Module({ imports: [CasesModule], controllers: [DocumentsController], providers: [DocumentsService] })
export class DocumentsModule {}
