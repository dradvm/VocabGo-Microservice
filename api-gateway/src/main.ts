import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProxyMiddleware } from './proxy.middleware';
import { JwtVerifyMiddleware } from './jwtverify.middleware';
import * as morgan from 'morgan';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['http://localhost:3000', 'http://26.3.244.182:3000'], // Cho phép FE truy cập
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true // Nếu bạn có gửi cookie/token qua header
  });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(morgan('dev'));
  app.use(JwtVerifyMiddleware(process.env.JWT_SECRET));
  app.use('/auth', ProxyMiddleware('http://localhost:3001'));
  app.use('/vocabulary', ProxyMiddleware('http://localhost:3002'));
  app.use('/translate', ProxyMiddleware('http://localhost:3003'));
  app.use('/user', ProxyMiddleware('http://localhost:3004'));
  app.use('/progress', ProxyMiddleware('http://localhost:3005'));
  app.use('/quest', ProxyMiddleware('http://localhost:3006'));
  app.use('/game', ProxyMiddleware('http://localhost:3007'));
  app.use('/cloudinary', ProxyMiddleware('http://localhost:3008'));

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}
bootstrap();
