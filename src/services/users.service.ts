import { PrismaClient, sigma_cloud_d_guard_integration_servers, sigma_cloud_d_guard_integration_workstations } from '@prisma/client/storage/client.js';
import { cryptographyUtil, HttpClientUtil, loggerUtil, BasicAndBearerStrategy } from '../../expressium/index.js';
import { ILoginMap, IResponse, IUserMap, IWorkstationCreationMap, IWorkstationMap, IWorkstationMapList} from './interfaces/index.js';

const prisma = new PrismaClient();

const synchronizeUsers = async (
  sigmaCloudDGuardIntegrationServer: sigma_cloud_d_guard_integration_servers,
  workstationMapList: IWorkstationMap.IWorkstationMap[]
): Promise<IUserMap.IUserMap[]> => {
  const workstationMapGuidList = workstationMapList.map((workstationMap: IWorkstationMap.IWorkstationMap): string => workstationMap.guid);
  const { id } = sigmaCloudDGuardIntegrationServer;
            
  await prisma.sigma_cloud_d_guard_integration_workstations.deleteMany(
    {
      where: {
        guid: { notIn: workstationMapGuidList },
        sigma_cloud_d_guard_integration_server_id: id
      }
    }
  );
  
  let sigmaCloudDGuardIntegrationWorkstationList = await prisma.sigma_cloud_d_guard_integration_workstations.findMany(
    {
      where: {
        guid: { in: workstationMapGuidList },
        sigma_cloud_d_guard_integration_server_id: id
      }
    }
  );
  
  const identifierSet = new Set<string>(sigmaCloudDGuardIntegrationWorkstationList.map((sigmaCloudDGuardIntegrationWorkstation: sigma_cloud_d_guard_integration_workstations): string => `${ sigmaCloudDGuardIntegrationWorkstation.guid }_${ sigmaCloudDGuardIntegrationWorkstation.sigma_cloud_d_guard_integration_server_id }`));

  const workstationCreationMapList = workstationMapList
    .filter((workstationMap: IWorkstationMap.IWorkstationMap): boolean => !identifierSet.has(`${ workstationMap.guid }_${ id }`))
    .map((workstationMap: IWorkstationMap.IWorkstationMap): IWorkstationCreationMap.IWorkstationCreationMap => ({ guid: workstationMap.guid, sigma_cloud_d_guard_integration_server_id: id }));
    
  if (workstationCreationMapList.length) {
    await prisma.sigma_cloud_d_guard_integration_workstations.createMany(
      {
        data: workstationCreationMapList,
        skipDuplicates: true
      }
    );
  }

  sigmaCloudDGuardIntegrationWorkstationList = await prisma.sigma_cloud_d_guard_integration_workstations.findMany(
    {
      where: {
        guid: { in: workstationMapGuidList },
        sigma_cloud_d_guard_integration_server_id: id
      }
    }
  );

  const sigmaCloudDGuardIntegrationWorkstationMap = new Map<string,sigma_cloud_d_guard_integration_workstations>(sigmaCloudDGuardIntegrationWorkstationList.map((sigmaCloudDGuardIntegrationWorkstation:sigma_cloud_d_guard_integration_workstations): [string,sigma_cloud_d_guard_integration_workstations] => [sigmaCloudDGuardIntegrationWorkstation.guid, sigmaCloudDGuardIntegrationWorkstation]));

  return workstationMapList.flatMap(
    (workstationMap: IWorkstationMap.IWorkstationMap): IUserMap.IUserMap[] => {
      const sigmaCloudDGuardIntegrationWorkstation = sigmaCloudDGuardIntegrationWorkstationMap.get(workstationMap.guid);
      
      return sigmaCloudDGuardIntegrationWorkstation 
        ? [
            { 
              id: sigmaCloudDGuardIntegrationWorkstation.id, 
              name: workstationMap.name,
              guid: workstationMap.guid
            }
          ] 
        : [];
    }
  ).filter(Boolean);
};

export const users = async (): Promise<IResponse.IResponse<IUserMap.IUserMap[]>> => {
  try {
    const sigmaCloudDGuardIntegrationServerList = await prisma.sigma_cloud_d_guard_integration_servers.findMany({ where: { is_sigma_cloud_d_guard_integration_server_active: true } });
        
    const userMapList = await Promise.all(
      sigmaCloudDGuardIntegrationServerList.map(
        async (sigmaCloudDGuardIntegrationServer: sigma_cloud_d_guard_integration_servers): Promise<IUserMap.IUserMap[]> => {
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
          
            const response = await httpClientInstance.get<IWorkstationMapList.IWorkstationMapList>(`http://${ ip }:${ port }/api/virtual-matrix/workstations`);  
            const workstationMapList = response.data.workstations;
            
            return synchronizeUsers(sigmaCloudDGuardIntegrationServer, workstationMapList);
          } catch (error: unknown) {
            loggerUtil.error(error instanceof Error ? error.message : String(error));

            return [];
          }
        }
      )
    );

    return {
      status: 200,
      data: userMapList
        .flat()
        .sort((userMapA: IUserMap.IUserMap, userMapB: IUserMap.IUserMap): number => userMapA.name.localeCompare(userMapB.name))
    };
  } catch (error: unknown) {
    loggerUtil.error(error instanceof Error ? error.message : String(error));

    return {
      status: 500,
      data: []
    };
  }
};
