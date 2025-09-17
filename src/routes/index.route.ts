import { Router } from 'express';
import { config } from '../config';
import { AppDataSource } from '../data-source';
import redis from '../config/redis';
import * as Sentry from '@sentry/node';

const indexRouter = Router();

indexRouter.get('/', async (req, res): Promise<any> => {
  return res.json({ service: config.SERVICE_NAME, status: 'running' });
});

indexRouter.get('/health', async (req, res): Promise<any> => {
  const health = {
    service: config.SERVICE_NAME,
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'unknown',
      redis: 'unknown',
      sentry: 'configured',
    },
  };

  try {
    // Check database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.query('SELECT 1');
      health.checks.database = 'connected';
    } else {
      health.checks.database = 'not_initialized';
    }
  } catch (error) {
    health.checks.database = 'error';
    health.status = 'degraded';
  }

  try {
    // Check Redis connection
    await redis.ping();
    health.checks.redis = 'connected';
  } catch (error) {
    health.checks.redis = 'error';
    health.status = 'degraded';
  }

  // Check Sentry configuration
  if (!config.SENTRY_DSN) {
    health.checks.sentry = 'not_configured';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;

  if (statusCode === 503) {
    Sentry.addBreadcrumb({
      message: 'Health check failed',
      category: 'health',
      level: 'warning',
      data: health,
    });
  }

  return res.status(statusCode).json(health);
});

// Test endpoint for Sentry (only in development)
if (process.env.NODE_ENV === 'development') {
  indexRouter.get('/test-sentry', async (req, res): Promise<any> => {
    try {
      throw new Error('This is a test error for Sentry');
    } catch (error) {
      Sentry.captureException(error);
      return res.json({ message: 'Test error sent to Sentry' });
    }
  });
}

export { indexRouter };
