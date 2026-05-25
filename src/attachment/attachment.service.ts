import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import { Attachment } from './attachment.entity';
import { TicketService } from '../ticket/ticket.service';

/**
 * Manages file attachment metadata for tickets.
 *
 * File size and MIME type validation is enforced at the controller boundary via
 * `ParseFilePipe` (10 MiB max inclusive; TDP 3.3 MIME allowlist including **`text/plain`**
 * on **`file.mimetype`**). This service handles ticket existence checks,
 * path-traversal sanitisation, and persistence.
 */
@Injectable()
export class AttachmentService {
  constructor(
    @InjectRepository(Attachment)
    private readonly attachmentRepository: Repository<Attachment>,
    private readonly ticketService: TicketService,
  ) {}

  /**
   * Records a file attachment for a ticket.
   *
   * The client-supplied filename is sanitised with `path.basename()`
   * to strip any directory-traversal sequences.
   *
   * @param ticketId - The ticket to attach the file to.
   * @param file     - The uploaded file (size and MIME already validated by `ParseFilePipe`).
   * @returns The persisted {@link Attachment} metadata.
   * @throws {NotFoundException} When the ticket does not exist.
   */
  async upload(
    ticketId: number,
    file: Express.Multer.File,
  ): Promise<Attachment> {
    await this.ticketService.findOne(ticketId);

    const attachment = this.attachmentRepository.create({
      ticketId,
      filename: path.basename(file.originalname),
      contentType: file.mimetype,
      size: file.size,
    });
    return this.attachmentRepository.save(attachment);
  }

  /**
   * Deletes an attachment record, verifying it belongs to the given ticket.
   *
   * @param ticketId     - The parent ticket.
   * @param attachmentId - The attachment to delete.
   * @throws {NotFoundException} When the attachment does not exist or doesn't belong to the ticket.
   */
  async remove(ticketId: number, attachmentId: number): Promise<void> {
    const attachment = await this.attachmentRepository.findOneBy({
      id: attachmentId,
    });
    if (!attachment || attachment.ticketId !== ticketId) {
      throw new NotFoundException(
        `Attachment with ID ${attachmentId} not found for ticket ${ticketId}`,
      );
    }
    await this.attachmentRepository.remove(attachment);
  }
}
