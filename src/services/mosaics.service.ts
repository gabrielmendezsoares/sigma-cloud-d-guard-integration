import { PrismaClient, sigma_cloud_d_guard_integration_layouts, sigma_cloud_d_guard_integration_servers } from '@prisma/client/storage/client.js';
import { cryptographyUtil, HttpClientUtil, loggerUtil, BasicAndBearerStrategy } from '../../expressium/index.js';
import { ILayoutCreationMap, ILayoutMap, ILayoutMapList, ILoginMap, IMosaicMap, IResponse } from './interfaces/index.js';

const prisma = new PrismaClient();

const synchronizeMosaics = async (
  sigmaCloudDGuardIntegrationServer: sigma_cloud_d_guard_integration_servers,
  layoutMapList: ILayoutMap.ILayoutMap[]
): Promise<IMosaicMap.IMosaicMap[]> => {
  const layoutMapGuidList = layoutMapList.map((layoutMap: ILayoutMap.ILayoutMap): string => layoutMap.guid);
  const { id } = sigmaCloudDGuardIntegrationServer;
            
  await prisma.sigma_cloud_d_guard_integration_layouts.deleteMany(
    {
      where: {
        guid: { notIn: layoutMapGuidList },
        sigma_cloud_d_guard_integration_server_id: id
      }
    }
  );
  
  let sigmaCloudDGuardIntegrationLayoutList = await prisma.sigma_cloud_d_guard_integration_layouts.findMany(
    {
      where: {
        guid: { in: layoutMapGuidList },
        sigma_cloud_d_guard_integration_server_id: id
      }
    }
  );
  
  const identifierSet = new Set<string>(sigmaCloudDGuardIntegrationLayoutList.map((sigmaCloudDGuardIntegrationLayout: sigma_cloud_d_guard_integration_layouts): string => `${ sigmaCloudDGuardIntegrationLayout.guid }_${ sigmaCloudDGuardIntegrationLayout.sigma_cloud_d_guard_integration_server_id }`));

  const layoutCreationMapList = layoutMapList
    .filter((layoutMap: ILayoutMap.ILayoutMap): boolean => !identifierSet.has(`${ layoutMap.guid }_${ id }`))
    .map((layoutMap: ILayoutMap.ILayoutMap): ILayoutCreationMap.ILayoutCreationMap => ({ guid: layoutMap.guid, sigma_cloud_d_guard_integration_server_id: id }));
    
  if (layoutCreationMapList.length) {
    await prisma.sigma_cloud_d_guard_integration_layouts.createMany(
      {
        data: layoutCreationMapList,
        skipDuplicates: true
      }
    );
  }

  sigmaCloudDGuardIntegrationLayoutList = await prisma.sigma_cloud_d_guard_integration_layouts.findMany(
    {
      where: {
        guid: { in: layoutMapGuidList },
        sigma_cloud_d_guard_integration_server_id: id
      }
    }
  );

  const sigmaCloudDGuardIntegrationLayoutMap = new Map<string,sigma_cloud_d_guard_integration_layouts>(sigmaCloudDGuardIntegrationLayoutList.map((sigmaCloudDGuardIntegrationLayout:sigma_cloud_d_guard_integration_layouts): [string,sigma_cloud_d_guard_integration_layouts] => [sigmaCloudDGuardIntegrationLayout.guid, sigmaCloudDGuardIntegrationLayout]));

  return layoutMapList.flatMap(
    (layoutMap: ILayoutMap.ILayoutMap): IMosaicMap.IMosaicMap[] => {
      const sigmaCloudDGuardIntegrationLayout = sigmaCloudDGuardIntegrationLayoutMap.get(layoutMap.guid);
      
      return sigmaCloudDGuardIntegrationLayout 
        ? [
            { 
              id: sigmaCloudDGuardIntegrationLayout.id, 
              name: layoutMap.name
            }
          ] 
        : [];
    }
  ).filter(Boolean);
};

export const mosaics = async (): Promise<IResponse.IResponse<IMosaicMap.IMosaicMap[]>> => {
  try {
    const sigmaCloudDGuardIntegrationServerList = await prisma.sigma_cloud_d_guard_integration_servers.findMany({ where: { is_sigma_cloud_d_guard_integration_server_active: true } });
        
    const mosaicMapList = await Promise.all(
      sigmaCloudDGuardIntegrationServerList.map(
        async (sigmaCloudDGuardIntegrationServer: sigma_cloud_d_guard_integration_servers): Promise<IMosaicMap.IMosaicMap[]> => {
          try {
            const {
              ip,
              port,
              username,
              password
            } = sigmaCloudDGuardIntegrationServer;

            const httpClientInstance = new HttpClientUtil.HttpClient();

            httpClientInstance.setAuthenticationStrategy(
              new BasicAndBearerStrategy.BasicAndBearerStrategy(
                'post',
                `http://${ ip }:${ port }/api/login`,
                undefined, 
                undefined, 
                undefined, 
                undefined,
                { 
                  username: cryptographyUtil.decryptFromAes256Cbc(
                    process.env.SIGMA_CLOUD_D_GUARD_INTEGRATION_SERVERS_USERNAME_ENCRYPTION_KEY as string, 
                    process.env.SIGMA_CLOUD_D_GUARD_INTEGRATION_SERVERS_USERNAME_IV_STRING as string, 
                    new TextDecoder().decode(username)
                  ), 
                  password: cryptographyUtil.decryptFromAes256Cbc(
                    process.env.SIGMA_CLOUD_D_GUARD_INTEGRATION_SERVERS_PASSWORD_ENCRYPTION_KEY as string, 
                    process.env.SIGMA_CLOUD_D_GUARD_INTEGRATION_SERVERS_PASSWORD_IV_STRING as string, 
                    new TextDecoder().decode(password)
                  ) 
                },
                (response: Axios.AxiosXHR<ILoginMap.ILoginMap>): string => response.data.login.userToken
              )
            );
          
            const response = await httpClientInstance.get<ILayoutMapList.ILayoutMapList>(`http://${ ip }:${ port }/api/virtual-matrix/layouts`);  
            const layoutMapList = response.data.layouts;
            
            return synchronizeMosaics(sigmaCloudDGuardIntegrationServer, layoutMapList);
          } catch (error: unknown) {
            loggerUtil.error(error instanceof Error ? error.message : String(error));

            return [];
          }
        }
      )
    );

    return {
      status: 200,
      data: mosaicMapList
        .flat()
        .sort((mosaicMapA: IMosaicMap.IMosaicMap, mosaicMapB: IMosaicMap.IMosaicMap): number => mosaicMapA.name.localeCompare(mosaicMapB.name))
    };
  } catch (error: unknown) {
    loggerUtil.error(error instanceof Error ? error.message : String(error));

    return {
      status: 500,
      data: []
    };
  }
};
