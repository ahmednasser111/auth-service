import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { config } from './index';
import logger from './logger';

export const initSentry = () => {
  if (!config.SENTRY_DSN) {
    logger.warn('Sentry DSN not provided. Sentry will not be initialized.');
    return;
  }

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.SENTRY_ENVIRONMENT,
    sampleRate: config.SENTRY_SAMPLE_RATE,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
    profilesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,

    beforeSend(event, hint) {
      if (process.env.NODE_ENV === 'test') {
        return null;
      }

      if (event.request?.data) {
        try {
          const data =
            typeof event.request.data === 'string'
              ? JSON.parse(event.request.data)
              : event.request.data;

          if (data.password) {
            data.password = '[Filtered]';
            event.request.data = JSON.stringify(data);
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      }

      if (event.request?.headers) {
        if (
          event.request.headers.Authorization ||
          event.request.headers.authorization
        ) {
          event.request.headers.Authorization = '[Filtered]';
          event.request.headers.authorization = '[Filtered]';
        }
      }

      return event;
    },

    initialScope: {
      tags: {
        service: config.SERVICE_NAME,
        version: require('../../package.json').version,
      },
    },
  });

  logger.info('Sentry initialized successfully');
};

export { Sentry };
