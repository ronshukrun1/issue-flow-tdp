import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './project.entity';
import { ProjectService } from './project.service';
import { ProjectController } from './project.controller';
import { UserModule } from '../user/user.module';

/**
 * Feature module that encapsulates everything related to project management.
 *
 * Imports {@link UserModule} to validate owner references during project
 * creation. Registers the {@link Project} entity with TypeORM and exposes
 * the {@link ProjectController} and {@link ProjectService}.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Project]), UserModule],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
