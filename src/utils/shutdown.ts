import { Server } from 'http';
import * as Sentry from '@sentry/node';
import { AppDataSource } from '../data-source';
import logger from '../config/logger';
import { RedisClient } from '../config/redis';
import { disconnectKafka } from '../events/kafka';

export const setupGracefulShutdown = (server: Server) => {
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info('Server closed');
          resolve();
        });
      });

      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
        logger.info('Database connection closed');
      }

      await RedisClient.closeConnection();

      await disconnectKafka();

      // Close Sentry with a timeout
      await Sentry.close(2000);
      logger.info('Sentry client closed');

      logger.info(
        'Graceful shutdown completed\n--------------------------------',
      );
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      Sentry.captureException(error);
      // Give Sentry time to send the error before exiting
      setTimeout(() => process.exit(1), 1000);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    Sentry.captureException(error);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    Sentry.captureException(reason as Error);
    shutdown('unhandledRejection');
  });
};
