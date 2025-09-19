import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Auth Service API',
      version: '1.0.0',
      description: `
A production-ready authentication and authorization microservice.

### 🚀 Features
- User Registration & JWT Authentication
- Redis-based Token Management
- Kafka Event Publishing
- Sentry Monitoring
- Swagger/OpenAPI Docs
- Health Check Endpoints
- Secure with Helmet, CORS, Winston Logging
`,
      contact: {
        name: 'Ahmed Nasser',
        url: 'https://github.com/ahmednasser111',
        email: 'ahmednaser7707@gmail.com',
      },
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Local Development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
