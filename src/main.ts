import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Bootstraps the NestJS application with global validation,
 * serialisation, Swagger documentation, and starts listening on port 3000.
 *
 * `ClassSerializerInterceptor` ensures that decorators like
 * `@Exclude()` on entity fields (e.g. `password`) are honoured
 * in every JSON response.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const config = new DocumentBuilder()
    .setTitle('IssueFlow API')
    .setDescription(
      'Ticket Management Backend — REST contract aligned with README.md. ' +
        'Mutating PATCH/update endpoints return 200 OK with an empty body. ' +
        'POST /tickets/import errors use structured objects: { row, title, field, message }. ' +
        'Authenticate via POST /auth/login, then Authorize with Bearer <JWT>.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);
  // Enable CORS
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  // Start the server
  await app.listen(3000);
}
bootstrap();
