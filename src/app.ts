import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import type { CorsOptions } from 'cors';
import morgan from 'morgan';
import routes from './routes';
import { errorHandler } from './middleware';
import { logger } from './config';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());
  // Permissive CORS for browser clients. This explicitly answers preflight
  // requests from any origin, including localhost dev servers and deployed UIs.
  const corsOptions: CorsOptions = {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
    optionsSuccessStatus: 204,
  };

  app.use(cors(corsOptions));

  // Body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logging
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  }));

  // Health check (public)
  app.get('/health', (req, res) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
      },
    });
  });

  // API routes
  app.use('/api/v1', routes);

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: {
        message: 'Endpoint not found',
      },
    });
  });

  // Error handler
  app.use(errorHandler);

  return app;
}
