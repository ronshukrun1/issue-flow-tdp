import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './project.entity';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { UserModule } from '../user/user.module';
import { TicketModule } from '../ticket/ticket.module';

/**
 * Feature module that encapsulates everything related to project management.
 *
 * Imports {@link UserModule} to validate owner references during project
 * creation, and {@link TicketModule} (via `forwardRef`) for the workload
 * endpoint. Registers the {@link Project} entity with TypeORM and exposes
 * the {@link ProjectController} and {@link ProjectService}.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Project]),
    forwardRef(() => UserModule),
    forwardRef(() => TicketModule),
  ],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
