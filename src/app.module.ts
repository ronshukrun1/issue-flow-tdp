import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ProjectModule } from './project/project.module';
import { TicketModule } from './ticket/ticket.module';
import { CommentModule } from './comment/comment.module';
import { AttachmentModule } from './attachment/attachment.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { EscalationModule } from './escalation/escalation.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

/**
 * Root application module that wires up the database connection,
 * registers feature modules, and exposes the health-check controller.
 *
 * Database credentials are loaded from environment variables via
 * `@nestjs/config`. Schema synchronisation is disabled in production
 * to prevent accidental data loss.
 *
 * Two global guards are registered in order:
 * 1. {@link JwtAuthGuard} — enforces JWT authentication (skipped for `@Public()` routes).
 * 2. {@link RolesGuard} — enforces role-based access control via `@Roles()`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'issueflow'),
        password: config.get<string>('DB_PASSWORD', 'issueflow'),
        database: config.get<string>('DB_NAME', 'issueflow'),
        autoLoadEntities: true,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    ScheduleModule.forRoot(),
    AuditLogModule,
    UserModule,
    AuthModule,
    ProjectModule,
    TicketModule,
    CommentModule,
    AttachmentModule,
    EscalationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
