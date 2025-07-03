import { Request } from 'express';
import momentTimezone from 'moment-timezone';
import { PrismaClient } from '@prisma/client/storage/client.js';
import { cryptographyUtil, HttpClientUtil, BasicAndBearerStrategy } from '../../expressium/src/index.js';
import { ILogin, IReqBody, IResponse, IWorkstationMap, IWorkstationMapList } from './interfaces/index.js';

const prisma = new PrismaClient();

export const showMosaic = async (req: Request): Promise<IResponse.IResponse<void>> => {
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

    if (!dGuardLayout) {
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

    const dGuardWorkstation = await prisma.d_guard_workstations.findUnique({ where: { id: userId } });
    
    if (!dGuardWorkstation) {
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
        (response: Axios.AxiosXHR<ILogin.ILogin>): string => response.data.login.userToken
      )
    );

    const workstationMapList = (await httpClientInstance.get<IWorkstationMapList.IWorkstationMapList>(`http://${ dGuardServer.ip }:${ dGuardServer.port }/api/virtual-matrix/workstations`)).data;   
    const workstationMap = workstationMapList.workstations.find((workstationMap: IWorkstationMap.IWorkstationMap): boolean => workstationMap.guid === dGuardWorkstation.guid);
    
    if (!workstationMap) {
      return {
        status: 404,
        data: undefined
      };
    }

    await httpClientInstance.put<unknown>(
      `http://${ dGuardServer.ip }:${ dGuardServer.port }/api/virtual-matrix/workstations/${ workstationMap.guid }/monitors/${ workstationMap.monitors[0].guid }/layout`,
      { layoutGuid: dGuardLayout.guid }
    );

    return {
      status: 200,
      data: undefined
    };
  } catch (error: unknown) {
    console.log(`Error | Timestamp: ${ momentTimezone().utc().format('DD-MM-YYYY HH:mm:ss') } | Path: src/services/showMosaic.service.ts | Location: showMosaic | Error: ${ error instanceof Error ? error.message : String(error) }`);

    return { 
      status: 500,
      data: undefined
    };
  }
};
