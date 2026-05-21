import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Bootstraps the NestJS application with global validation,
 * serialisation, and starts listening on port 3000.
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

  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  await app.listen(3000);
}
bootstrap();
