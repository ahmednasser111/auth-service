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

// Sentry request handler must be the first middleware
app.use(Sentry.Handlers.requestHandler());

// Sentry tracing handler for performance monitoring
app.use(Sentry.Handlers.tracingHandler());

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

AppDataSource.initialize()
  .then(async () => {
    await init();

    const server = app.listen(config.PORT, () => {
      logger.info(
        `${config.SERVICE_NAME} is running on http://localhost:${config.PORT}`,
      );
    });

    setupGracefulShutdown(server);
  })
  .catch((err) => {
    logger.error('error during Data Source initialization', err);
    Sentry.captureException(err);
    process.exit(1);
  });
