import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client/storage/client.js';
import { cryptographyUtil, HttpClientUtil, BasicAndBearerStrategy } from '../../expressium/src/index.js';
import { IReqBody, IResponse, IWorkstation } from './interfaces/index.js';

const prisma = new PrismaClient();

export const showMosaic = async (
  req: Request, 
  _res: Response, 
  _next: NextFunction, 
  timestamp: string
): Promise<IResponse.IResponse<void>> => {
  try {
    const { 
      mosaicId,
      userId
    } = req.body as IReqBody.IShowMosaicReqBody;

    if (!mosaicId || !userId) {
      return {
        status: 400,
        data: undefined
      };
    }
    
    const dGuardLayout = await prisma.d_guard_layouts.findUnique({ where: { id: mosaicId } });
    const dGuardWorkstation = await prisma.d_guard_workstations.findUnique({ where: { id: userId } });
    
    if (!dGuardLayout || !dGuardWorkstation) {
      return {
        status: 404,
        data: undefined
      };
    }
    
    const dGuardServer = await prisma.d_guard_servers.findUnique({ where: { id: dGuardLayout.d_guard_servers_id } });
    
    if (!dGuardServer) {
      return {
        status: 404,
        data: undefined
      };
    }

    const httpClientInstance = new HttpClientUtil.HttpClient();
  
    httpClientInstance.setAuthenticationStrategy(
      new BasicAndBearerStrategy.BasicAndBearerStrategy(
        'post',
        `http://${ dGuardServer.ip }:${ dGuardServer.port }/api/login`,
        undefined,
        undefined,
        undefined,
        undefined,
        { 
          username: cryptographyUtil.decryptFromAes256Cbc(
            process.env.D_GUARD_SERVERS_USERNAME_ENCRYPTION_KEY as string, 
            process.env.D_GUARD_SERVERS_USERNAME_IV_STRING as string, 
            new TextDecoder().decode(dGuardServer.username)
          ), 
          password: cryptographyUtil.decryptFromAes256Cbc(
            process.env.D_GUARD_SERVERS_PASSWORD_ENCRYPTION_KEY as string, 
            process.env.D_GUARD_SERVERS_PASSWORD_IV_STRING as string, 
            new TextDecoder().decode(dGuardServer.password)
          )
        },
        (response: Axios.AxiosXHR<{ login: { userToken: string; }; }>): string => response.data?.login?.userToken
      )
    );

    const serverVirtualMatrixWorkstations = await httpClientInstance.get<{ workstations: IWorkstation.IWorkstation[]; }>(`http://${ dGuardServer.ip }:${ dGuardServer.port }/api/virtual-matrix/workstations`);
    const workstation = serverVirtualMatrixWorkstations.data.workstations.find((workstation: IWorkstation.IWorkstation): boolean => workstation.guid === dGuardWorkstation.guid);
    
    if (!workstation) {
      return {
        status: 404,
        data: undefined
      };
    }

    await httpClientInstance.put<unknown>(
      `http://${ dGuardServer.ip }:${ dGuardServer.port }/api/virtual-matrix/workstations/${ workstation.guid }/monitors/${ workstation.monitors[0].guid }/layout`,
      { layoutGuid: dGuardLayout.guid }
    );

    return {
      status: 200,
      data: undefined
    };
  } catch (error: unknown) {
    console.log(`Error | Timestamp: ${ timestamp } | Path: src/services/showMosaic.service.ts | Location: showMosaic | Error: ${ error instanceof Error ? error.message : String(error) }`);

    return { 
      status: 500,
      data: undefined
    };
  }
};
