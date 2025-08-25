import { Request, Response } from 'express';
import { loggerUtil } from '../../expressium/index.js';
import { showMosaicService } from '../services/index.js';

export const showMosaic = async (
  req: Request, 
  res: Response
): Promise<void> => {
  try {
    const { status, data } = await showMosaicService.showMosaic(req);
    
    res.status(status).json(data);
  } catch (error: unknown) {
    loggerUtil.error(error instanceof Error ? error.message : String(error));

    res
      .status(500)
      .json(
        { 
          message: 'The show mosaic process encountered a technical issue.',
          suggestion: 'Please try again later or contact support if the issue persists.'
        }
      );
  }
};
