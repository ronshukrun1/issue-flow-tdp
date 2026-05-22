import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment } from './attachment.entity';
import { AttachmentService } from './attachment.service';
import { AttachmentController } from './attachment.controller';
import { TicketModule } from '../ticket/ticket.module';

/**
 * Feature module for managing file attachments on tickets.
 *
 * Imports {@link TicketModule} to validate that the parent ticket
 * exists before accepting an upload.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Attachment]), TicketModule],
  controllers: [AttachmentController],
  providers: [AttachmentService],
  exports: [AttachmentService],
})
export class AttachmentModule {}
