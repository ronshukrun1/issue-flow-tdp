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
  HttpCode,
  HttpStatus,
  FileValidator,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { AttachmentService } from './attachment.service';
import { Attachment } from './attachment.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

/**
 * Maximum attachment upload size in bytes (10 MiB inclusive), per TDP 3.3.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * Normalised primary MIME type from Multer's `file.mimetype` (strip parameters
 * such as `; charset=utf-8` and compare case-insensitively on the base token).
 */
export function normaliseAttachmentMimeBase(
  mimetype: string | undefined,
): string {
  if (!mimetype || typeof mimetype !== 'string') {
    return '';
  }
  const base = mimetype.split(';')[0].trim().toLowerCase();
  return base;
}

/** Exact TDP 3.3 allowlist (after {@link normaliseAttachmentMimeBase}). */
const ALLOWED_ATTACHMENT_MIME_BASES = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf',
  'text/plain',
]);

export function isAllowedAttachmentMimeBase(
  mimetype: string | undefined,
): boolean {
  const base = normaliseAttachmentMimeBase(mimetype);
  return base.length > 0 && ALLOWED_ATTACHMENT_MIME_BASES.has(base);
}

/**
 * Accepts only TDP 3.3 types on `file.mimetype` (no magic-byte sniffing).
 * Rejects e.g. `image/jpg` — only `image/jpeg` is allowed.
 */
export class AllowedAttachmentMimeTypeValidator extends FileValidator<
  Record<string, never>
> {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file?.mimetype) {
      return false;
    }
    return isAllowedAttachmentMimeBase(file.mimetype);
  }

  buildErrorMessage(file?: Express.Multer.File): string {
    const got = file?.mimetype
      ? `'${normaliseAttachmentMimeBase(file.mimetype) || file.mimetype}'`
      : 'none';
    return `Attachment MIME type ${got} is not allowed. Allowed types: image/png, image/jpeg, application/pdf, text/plain`;
  }
}

/**
 * Inclusive 10 MiB cap (file size may equal the limit).
 */
export class InclusiveMaxAttachmentSizeValidator extends FileValidator<{
  maxBytes: number;
}> {
  constructor(maxBytes: number = MAX_ATTACHMENT_BYTES) {
    super({ maxBytes });
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file || !('size' in file)) {
      return false;
    }
    return file.size <= this.validationOptions.maxBytes;
  }

  buildErrorMessage(_file?: Express.Multer.File): string {
    return `Attachment file exceeds the maximum allowed size of ${this.validationOptions.maxBytes} bytes (10 MB)`;
  }
}

/**
 * Handles file attachment upload and deletion for tickets.
 *
 * File validation (size, MIME type) is enforced at the controller boundary via
 * `ParseFilePipe` with explicit MIME allowlisting on `file.mimetype` (TDP 3.3:
 * image/png, image/jpeg, application/pdf, text/plain — not Nest's magic-number-only
 * `FileTypeValidator`, which wrongly rejected `text/plain`). Size is capped at **10 MiB inclusive**.
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
   * Accepts `multipart/form-data` with a `file` field. Rejects files over **10 MiB**
   * or MIME types outside TDP 3.3 at the pipe level.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
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
          new InclusiveMaxAttachmentSizeValidator(),
          new AllowedAttachmentMimeTypeValidator(),
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
