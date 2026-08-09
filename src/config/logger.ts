import pino from 'pino';
import { isDev } from './env';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  transport: isDev && !process.env.VERCEL
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
        },
      }
    : undefined,
});

export default logger;
