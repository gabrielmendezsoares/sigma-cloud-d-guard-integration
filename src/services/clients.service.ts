import { IClientMap, IResponse } from './interfaces/index.js';

export const clients = (): IResponse.IResponse<IClientMap.IClientMap[]> => {
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
