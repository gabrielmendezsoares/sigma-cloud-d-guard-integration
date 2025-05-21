import { IResponse } from '../interfaces/index.js';
import { IClient } from './interfaces/index.js';

export const clients = (): IResponse.IResponse<IClient.IClient[]> => {
  return {
    status: 200,
    data: [
      {
        id: 6590,
        companyName: 'New Line',
        tradeName: 'New Line'
      }
    ]
  };
};
