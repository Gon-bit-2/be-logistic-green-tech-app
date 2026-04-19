jest.mock('@nestjs/core', () => ({
  NestFactory: {
    create: jest.fn(),
  },
}));

jest.mock('helmet', () => jest.fn(() => 'helmet-middleware'));

import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { bootstrap } from './main';
import { AppModule } from './app.module';

describe('bootstrap', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates the app with rawBody enabled', async () => {
    const app = {
      use: jest.fn(),
      enableCors: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalInterceptors: jest.fn(),
      get: jest.fn(),
      listen: jest.fn().mockResolvedValue(undefined),
    };

    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    await bootstrap();

    expect(NestFactory.create).toHaveBeenCalledWith(AppModule, { rawBody: true });
    expect(app.use).toHaveBeenCalledWith('helmet-middleware');
    expect(app.enableCors).toHaveBeenCalledTimes(1);
    expect(app.useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(app.useGlobalInterceptors).toHaveBeenCalledTimes(1);
    expect(app.get).toHaveBeenCalledTimes(1);
    expect(app.listen).toHaveBeenCalledWith(process.env.PORT ?? 3000);
    expect(helmet).toHaveBeenCalledTimes(1);
  });
});
