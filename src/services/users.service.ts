import momentTimezone from 'moment-timezone';
import { PrismaClient } from '@prisma/client/storage/client.js';
import { cryptographyUtil, HttpClientUtil, BasicAndBearerStrategy } from '../../expressium/src/index.js';
import { IDGuardServer, IDGuardWorkstation, ILogin, IResponse, IUser, IWorkstationCreationMap, IWorkstationMap, IWorkstationMapList } from './interfaces/index.js';

const prisma = new PrismaClient();

export const users = async (): Promise<IResponse.IResponse<IUser.IUser[]>> => {
  try {
    const dGuardServerList = await prisma.d_guard_servers.findMany();
    
    const userList = await Promise.all(
      dGuardServerList.map(
        async (dGuardServer: IDGuardServer.IDGuardServer): Promise<IUser.IUser[]> => {
          try {
            const {
              id,
              ip,
              port,
              username,
              password
            } = dGuardServer;

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
                    process.env.D_GUARD_SERVERS_USERNAME_ENCRYPTION_KEY as string, 
                    process.env.D_GUARD_SERVERS_USERNAME_IV_STRING as string, 
                    new TextDecoder().decode(username)
                  ), 
                  password: cryptographyUtil.decryptFromAes256Cbc(
                    process.env.D_GUARD_SERVERS_PASSWORD_ENCRYPTION_KEY as string, 
                    process.env.D_GUARD_SERVERS_PASSWORD_IV_STRING as string, 
                    new TextDecoder().decode(password)
                  ) 
                },
                (response: Axios.AxiosXHR<ILogin.ILogin>): string => response.data.login.userToken
              )
            );
          
            const workstationMapList = (await httpClientInstance.get<IWorkstationMapList.IWorkstationMapList>(`http://${ ip }:${ port }/api/virtual-matrix/workstations`)).data;      
            const workstationMapGuidList = workstationMapList.workstations.map((workstationMap: IWorkstationMap.IWorkstationMap): string => workstationMap.guid);
            
            if (workstationMapGuidList.length > 0) {
              await prisma.d_guard_workstations.deleteMany(
                {
                  where: {
                    guid: { notIn: workstationMapGuidList },
                    d_guard_servers_id: id
                  }
                }
              );
            }
            
            let dGuardWorkstationList = await prisma.d_guard_workstations.findMany(
              {
                where: {
                  guid: { in: workstationMapGuidList },
                  d_guard_servers_id: id
                }
              }
            );
            
            const dGuardWorkstationGuidSet = new Set<string>(dGuardWorkstationList.map((dGuardWorkstation: IDGuardWorkstation.IDGuardWorkstation): string => `${ dGuardWorkstation.guid }_${ dGuardWorkstation.d_guard_servers_id }`));

            const workstationCreationMapList = workstationMapList.workstations
              .filter((workstationMap: IWorkstationMap.IWorkstationMap): boolean => !dGuardWorkstationGuidSet.has(`${ workstationMap.guid }_${ id }`))
              .map((workstationMap: IWorkstationMap.IWorkstationMap): IWorkstationCreationMap.IWorkstationCreationMap => ({ guid: workstationMap.guid, d_guard_servers_id: id }));
              
            if (workstationCreationMapList.length > 0) {
              await prisma.d_guard_workstations.createMany(
                {
                  data: workstationCreationMapList,
                  skipDuplicates: true
                }
              );
            }
          
            dGuardWorkstationList = await prisma.d_guard_workstations.findMany(
              {
                where: {
                  guid: { in: workstationMapGuidList },
                  d_guard_servers_id: id
                }
              }
            );
 
            const dGuardWorkstationMap = new Map<string, IDGuardWorkstation.IDGuardWorkstation>(dGuardWorkstationList.map((dGuardWorkstation: IDGuardWorkstation.IDGuardWorkstation): [string, IDGuardWorkstation.IDGuardWorkstation] => [dGuardWorkstation.guid, dGuardWorkstation]));
          
            return workstationMapList.workstations.map(
              (workstationMap: IWorkstationMap.IWorkstationMap): IUser.IUser | null => {
                const dGuardWorkstation = dGuardWorkstationMap.get(workstationMap.guid);
                
                return dGuardWorkstation 
                  ? { 
                      id: dGuardWorkstation.id, 
                      name: workstationMap.name, 
                      guid: workstationMap.guid 
                    } 
                  : null;
              }
            ).filter(Boolean) as IUser.IUser[];
          } catch (error: unknown) {
            console.log(`Error | Timestamp: ${ momentTimezone().utc().format('DD-MM-YYYY HH:mm:ss') } | Path: src/services/users.service.ts | Location: users | Error: ${ error instanceof Error ? error.message : String(error) }`);

            return [];
          }
        }
      )
    );

    return {
      status: 200,
      data: userList
        .flat()
        .filter((userA: IUser.IUser, index: number, self: IUser.IUser[]): boolean => index === self.findIndex((userB: IUser.IUser): boolean => userA.guid === userB.guid))
        .sort((userA: IUser.IUser, userB: IUser.IUser): number => userA.name.localeCompare(userB.name))
    };
  } catch (error: unknown) {
    console.log(`Error | Timestamp: ${ momentTimezone().utc().format('DD-MM-YYYY HH:mm:ss') } | Path: src/services/users.service.ts | Location: users | Error: ${ error instanceof Error ? error.message : String(error) }`);

    return {
      status: 500,
      data: []
    };
  }
};
