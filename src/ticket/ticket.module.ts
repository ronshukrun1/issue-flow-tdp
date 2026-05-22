import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './ticket.entity';
import { User } from '../user/user.entity';
import { TicketService } from './ticket.service';
import { TicketController } from './ticket.controller';
import { ProjectModule } from '../project/project.module';
import { UserModule } from '../user/user.module';

/**
 * Feature module that encapsulates ticket (issue) management.
 *
 * Imports {@link ProjectModule} and {@link UserModule} to validate
 * foreign-key references during ticket creation and updates.
 * Registers the {@link User} entity so the auto-assignment and
 * workload queries can access the users table directly.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, User]),
    forwardRef(() => ProjectModule),
    forwardRef(() => UserModule),
  ],
  controllers: [TicketController],
  providers: [TicketService],
  exports: [TicketService],
})
export class TicketModule {}
