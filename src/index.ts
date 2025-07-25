import express, { Express, NextFunction, Request, Response } from 'express';
import momentTimezone from 'moment-timezone';
import morgan from 'morgan';
import startServer, { router, getAccessLog, createServer } from '../expressium/src/index.js';
import { appRoute } from './routes/index.js';

const buildServer = async (): Promise<void> => {
  try {
    const app = express();

    if (process.env.NODE_ENV !== 'production') {
      const accessLog = await getAccessLog();

      app.use(morgan('combined', { stream: accessLog.createWriteStream() }));
    }
    
    app.use(express.json());
    app.use('/internal', router);

    app.use(
      (
        req: Request, 
        res: Response, 
        _next: NextFunction
      ): void => {
        res
          .status(404)
          .json(
            {
              timestamp: momentTimezone().utc().format('DD-MM-YYYY HH:mm:ss'),
              status: false,
              statusCode: 404,
              method: req.method,
              path: req.originalUrl || req.url,
              query: req.query,
              headers: req.headers,
              body: req.body,
              message: 'Route not found.',
              suggestion: 'Please check the URL and HTTP method to ensure they are correct.'
            }
          );
      }
    );

    const serverInstance = await createServer(app);

    appRoute.buildRoutes();
    
    startServer(serverInstance as Express);
  } catch (error: unknown) {
    console.log(`Error | Timestamp: ${ momentTimezone().utc().format('DD-MM-YYYY HH:mm:ss') } | Path: src/index.ts | Location: buildServer | Error: ${ error instanceof Error ? error.message : String(error) }`);
    process.exit(1);;
  }
};

buildServer();
