import { Request, Response } from 'express';
import { loggerUtil } from '../../expressium/index.js';
import { clientsService } from '../services/index.js';

export const clients = (
  _req: Request, 
  res: Response
): void => {
  try {
    const { status, data } = clientsService.clients();
    
    res.status(status).json(data);
  } catch (error: unknown) {
    loggerUtil.error(error instanceof Error ? error.message : String(error));

    res
      .status(500)
      .json(
        { 
          message: 'The client retrieval process encountered a technical issue.',
          suggestion: 'Please try again later or contact support if the issue persists.'
        }
      );
  }
};
