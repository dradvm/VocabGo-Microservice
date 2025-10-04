import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ProxyMiddleware } from './proxy.middleware';
import { JwtVerifyMiddleware } from './jwtverify.middleware';
import * as morgan from 'morgan';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  app.use(morgan('dev'));
  // app.use(JwtVerifyMiddleware(process.env.JWT_SECRET));
  app.use('/auth', ProxyMiddleware('http://localhost:3001'));
  app.use('/hello', (req, res) => {
    res.send({ message: 'Hello from API Gateway' });
  });
  app.use('/vocabulary', ProxyMiddleware('http://localhost:3002'));
  app.use('/translate', ProxyMiddleware('http://localhost:3003'));

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
