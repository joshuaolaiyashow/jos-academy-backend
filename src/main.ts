import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  // rawBody: true keeps the raw request Buffer available as req.rawBody alongside
  // the normally-parsed body — needed so the media transcode-callback webhook can
  // verify its HMAC signature against the exact bytes the sender signed.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  // One hop: the AWS load balancer. Without this req.ip is the ALB's address, so
  // audit entries would record the balancer instead of the real client.
  app.set('trust proxy', 1);
  // LiveKit webhooks are sent as application/webhook+json; parsed like JSON so
  // req.rawBody is kept for signature verification. application/json must stay
  // in the list: registering any json parser here makes Nest skip its default
  // one, which would leave every normal request body empty.
  app.useBodyParser('json', {
    type: ['application/json', 'application/webhook+json'],
  });

  // Enable global validation pipe for DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Browsers send Origin without a trailing slash, so entries must not have one.
  // CORS_ORIGINS (comma-separated) adds origins such as a custom domain.
  const allowedOrigins = [
    'https://jos-academy.d2edm0lxslfxbn.amplifyapp.com',
    'http://localhost:3000',
    ...(process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  ];
  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization',
  });

  // Swagger OpenAPI Configuration
  const config = new DocumentBuilder()
    .setTitle('JOS Server API')
    .setDescription('API documentation for JOS Server')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(
    `📚 Swagger documentation is available at: http://localhost:${port}/api/docs`,
  );
}
bootstrap();
