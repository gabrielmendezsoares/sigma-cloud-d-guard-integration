import { Request, Response } from 'express';
import { loggerUtil } from '../../expressium/index.js';
import { usersService } from '../services/index.js';

export const users = async (
  _req: Request, 
  res: Response
): Promise<void> => {
  try {
    const { status, data } = await usersService.users();
    
    res.status(status).json(data);
  } catch (error: unknown) {
    loggerUtil.error(error instanceof Error ? error.message : String(error));

    res
      .status(500)
      .json(
        { 
          message: 'The user retrieval process encountered a technical issue.',
          suggestion: 'Please try again later or contact support if the issue persists.'
        }
      );
  }
};
