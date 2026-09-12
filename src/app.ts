import dotenv from 'dotenv';
dotenv.config();

// Initialize Sentry before importing other modules
import { initSentry } from './config/sentry';
initSentry();

import * as Sentry from '@sentry/node';
import express from 'express';
import helmet from 'helmet';

import { verifyToken } from './middlewares/auth.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { corsMiddleware } from './middlewares/cors.middleware';
import {
  sentryUserContext,
  sentryRequestBreadcrumb,
} from './middlewares/sentry.middleware';
import logger from './config/logger';
import { reqLogger } from './middlewares/req.middleware';
import { AppDataSource } from './data-source';
import { config } from './config';
import { authRouter, indexRouter } from './routes';
import init from './init';
import { setupGracefulShutdown } from './utils/shutdown';
import { setupSwagger } from './config/swagger';

const app = express();

// Lazy initialization of database and Kafka
let isInitialized = false;
const initializeApp = async () => {
  if (!isInitialized) {
    await AppDataSource.initialize();
    await init();
    isInitialized = true;
    logger.info('Database and services initialized');
  }
};

// Sentry request handler must be the first middleware
app.use(Sentry.Handlers.requestHandler());

// Sentry tracing handler for performance monitoring
app.use(Sentry.Handlers.tracingHandler());

// Ensure app is initialized before processing any requests
app.use(async (req, res, next) => {
  try {
    await initializeApp();
    next();
  } catch (err) {
    logger.error('Initialization failed', err);
    Sentry.captureException(err);
    next(err);
  }
});

app.use(helmet());
app.use(corsMiddleware);

app.use(reqLogger);
app.use(express.json());

setupSwagger(app);

// Add Sentry middlewares
app.use(sentryRequestBreadcrumb);
app.use(verifyToken);
app.use(sentryUserContext);

app.use('/', indexRouter);
app.use('/api/v1/auth', authRouter);

// Sentry error handler must be before other error handlers
app.use(Sentry.Handlers.errorHandler());

app.use(errorHandler);

// Only listen if not running on Vercel (Vercel's runtime handles listening itself; a plain
// Docker/production deployment still needs app.listen(), which the previous NODE_ENV check
// here was accidentally skipping).
if (!process.env.VERCEL) {
  initializeApp()
    .then(() => {
      const server = app.listen(config.PORT, () => {
        logger.info(
          `${config.SERVICE_NAME} is running on http://localhost:${config.PORT}`,
        );
      });
      setupGracefulShutdown(server);
    })
    .catch((err) => {
      logger.error('error during app initialization', err);
      Sentry.captureException(err);
      process.exit(1);
    });
}

export default app;
