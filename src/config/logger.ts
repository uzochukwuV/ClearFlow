import pino from 'pino';
import { isDev } from './env';

const usePrettyTransport = isDev && !process.env.VERCEL && !!process.stdout.isTTY;

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  transport: usePrettyTransport
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
