import { Request } from 'express';
import { PrismaClient } from '@prisma/client/storage/client.js';
import { cryptographyUtil, HttpClientUtil, loggerUtil, BasicAndBearerStrategy } from '../../expressium/index.js';
import { ILoginMap, IReqBody, IResponse, IWorkstationMap, IWorkstationMapList } from './interfaces/index.js';

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
    
    const sigmaCloudDGuardIntegrationLayout = await prisma.sigma_cloud_d_guard_integration_layouts.findUnique({ where: { id: mosaicId } });

    if (!sigmaCloudDGuardIntegrationLayout) {
      return {
        status: 404,
        data: undefined
      };
    }

    const [
      sigmaCloudDGuardIntegrationServer,
      sigmaCloudDGuardIntegrationWorkstation
    ] = await Promise.all(
      [
        prisma.sigma_cloud_d_guard_integration_servers.findUnique({ where: { id: sigmaCloudDGuardIntegrationLayout.sigma_cloud_d_guard_integration_server_id } }),
        prisma.sigma_cloud_d_guard_integration_workstations.findUnique({ where: { id: userId } })
      ]
    );

    if (!sigmaCloudDGuardIntegrationServer || !sigmaCloudDGuardIntegrationWorkstation) {
      return {
        status: 404,
        data: undefined
      };
    }
    
    const httpClientInstance = new HttpClientUtil.HttpClient();
  
    httpClientInstance.setAuthenticationStrategy(
      new BasicAndBearerStrategy.BasicAndBearerStrategy(
        'post',
        `http://${ sigmaCloudDGuardIntegrationServer.ip }:${ sigmaCloudDGuardIntegrationServer.port }/api/login`,
        undefined, 
        undefined, 
        undefined, 
        undefined,
        { 
          username: cryptographyUtil.decryptFromAes256Cbc(
            process.env.SIGMA_CLOUD_D_GUARD_INTEGRATION_SERVERS_USERNAME_ENCRYPTION_KEY as string, 
            process.env.SIGMA_CLOUD_D_GUARD_INTEGRATION_SERVERS_USERNAME_IV_STRING as string, 
            new TextDecoder().decode(sigmaCloudDGuardIntegrationServer.username)
          ), 
          password: cryptographyUtil.decryptFromAes256Cbc(
            process.env.SIGMA_CLOUD_D_GUARD_INTEGRATION_SERVERS_PASSWORD_ENCRYPTION_KEY as string, 
            process.env.SIGMA_CLOUD_D_GUARD_INTEGRATION_SERVERS_PASSWORD_IV_STRING as string, 
            new TextDecoder().decode(sigmaCloudDGuardIntegrationServer.password)
          ) 
        },
        (response: Axios.AxiosXHR<ILoginMap.ILoginMap>): string => response.data.login.userToken
      )
    );

    const response = await httpClientInstance.get<IWorkstationMapList.IWorkstationMapList>(`http://${ sigmaCloudDGuardIntegrationServer.ip }:${ sigmaCloudDGuardIntegrationServer.port }/api/virtual-matrix/workstations`);   
    const workstationMap = response.data.workstations.find((workstationMap: IWorkstationMap.IWorkstationMap): boolean => workstationMap.guid === sigmaCloudDGuardIntegrationWorkstation.guid);
    
    if (!workstationMap) {
      return {
        status: 404,
        data: undefined
      };
    }

    await httpClientInstance.put<unknown>(
      `http://${ sigmaCloudDGuardIntegrationServer.ip }:${ sigmaCloudDGuardIntegrationServer.port }/api/virtual-matrix/workstations/${ workstationMap.guid }/monitors/${ workstationMap.monitors[0].guid }/layout`,
      { layoutGuid: sigmaCloudDGuardIntegrationLayout.guid }
    );

    return {
      status: 200,
      data: undefined
    };
  } catch (error: unknown) {
    loggerUtil.error(error instanceof Error ? error.message : String(error));

    return { 
      status: 500,
      data: undefined
    };
  }
};
