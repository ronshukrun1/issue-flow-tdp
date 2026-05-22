import {
  Controller,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentService } from './attachment.service';
import { Attachment } from './attachment.entity';

/** 10 MB expressed in bytes. */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Handles file attachment upload and deletion for tickets.
 *
 * File validation (size, MIME type) is enforced at the controller
 * boundary via NestJS's `ParseFilePipe` so oversized payloads are
 * rejected before the buffer reaches the service layer.
 */
@Controller('tickets/:ticketId/attachments')
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  /**
   * `POST /tickets/:ticketId/attachments` — uploads a file attachment.
   *
   * Accepts `multipart/form-data` with a `file` field. Rejects files
   * larger than 10 MB or with disallowed MIME types at the pipe level.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
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
  ): Promise<Attachment> {
    return this.attachmentService.upload(ticketId, file);
  }

  /**
   * `DELETE /tickets/:ticketId/attachments/:attachmentId` — deletes an attachment.
   */
  @Delete(':attachmentId')
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('attachmentId', ParseIntPipe) attachmentId: number,
  ): Promise<void> {
    return this.attachmentService.remove(ticketId, attachmentId);
  }
}
