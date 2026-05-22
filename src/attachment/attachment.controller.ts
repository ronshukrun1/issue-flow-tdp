import {
  Controller,
  Post,
  Delete,
  Param,
  Req,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AttachmentService } from './attachment.service';
import { Attachment } from './attachment.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

/** 10 MB expressed in bytes. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Handles file attachment upload and deletion for tickets.
 *
 * File validation (size, MIME type) is enforced at the controller
 * boundary via NestJS's `ParseFilePipe` so oversized payloads are
 * rejected before the buffer reaches the service layer.
 */
@ApiTags('Attachments')
@ApiBearerAuth()
@Controller('tickets/:ticketId/attachments')
export class AttachmentController {
  constructor(
    private readonly attachmentService: AttachmentService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * `POST /tickets/:ticketId/attachments` — uploads a file attachment.
   *
   * Accepts `multipart/form-data` with a `file` field. Rejects files
   * larger than 10 MB or with disallowed MIME types at the pipe level.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  async upload(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({
            fileType: /^(image\/png|image\/jpeg|application\/pdf|text\/plain)$/,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Req() req: Request,
  ): Promise<Attachment> {
    const attachment = await this.attachmentService.upload(ticketId, file);
    await this.auditLogService.log({
      action: AuditAction.CREATE,
      entityType: 'ATTACHMENT',
      entityId: attachment.id,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
    return attachment;
  }

  /**
   * `DELETE /tickets/:ticketId/attachments/:attachmentId` — deletes an attachment.
   */
  @Delete(':attachmentId')
  async remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
    @Req() req: Request,
  ): Promise<void> {
    await this.attachmentService.remove(ticketId, attachmentId);
    await this.auditLogService.log({
      action: AuditAction.DELETE,
      entityType: 'ATTACHMENT',
      entityId: attachmentId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }
}
