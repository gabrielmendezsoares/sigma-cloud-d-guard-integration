import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client/storage/client.js';
import { cryptographyUtil, HttpClientUtil, BasicAndBearerStrategy } from '../../expressium/src/index.js';
import { IResponse } from '../interfaces/index.js';
import { IDGuardServer, IDGuardWorkstation, IUser, IWorkstation } from './interfaces/index.js';

const prisma = new PrismaClient();

export const users = async (
  _req: Request, 
  _res: Response, 
  _next: NextFunction, 
  timestamp: string
): Promise<IResponse.IResponse<IUser.IUser[]>> => {
  try {
    const dGuardServerList = await prisma.d_guard_servers.findMany();
    
    const userList = await Promise.all(
      dGuardServerList.map(
        async ({ id, ip, port, username, password }: IDGuardServer.IDGuardServer): Promise<IUser.IUser[]> => {
          try {
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
                (response: Axios.AxiosXHR<{ login: { userToken: string; }; }>): string => response.data?.login?.userToken,
                (): number => 0
              )
            );
          
            const { data: serverApiVirtualMatrixWorkstationsData } = await httpClientInstance.get<{ workstations: IWorkstation.IWorkstation[]; }>(`http://${ ip }:${ port }/api/virtual-matrix/workstations`);      
            const workstationList = serverApiVirtualMatrixWorkstationsData.workstations;
            const workstationGuidList = workstationList.map((workstation: IWorkstation.IWorkstation): string => workstation.guid);
            
            if (workstationGuidList.length > 0) {
              await prisma.d_guard_workstations.deleteMany(
                {
                  where: {
                    guid: { notIn: workstationGuidList },
                    server_id: id
                  }
                }
              );
            }
            
            const dGuardWorkstationListA = await prisma.d_guard_workstations.findMany(
              {
                where: {
                  guid: { in: workstationGuidList },
                  server_id: id
                }
              }
            );
            
            const dGuardWorkstationGuidSet = new Set<string>(dGuardWorkstationListA.map((dGuardWorkstation: IDGuardWorkstation.IDGuardWorkstation): string => `${ dGuardWorkstation.guid }_${ dGuardWorkstation.server_id }`));

            const dGuardWorkstationCreationList = workstationList
              .filter((workstation: IWorkstation.IWorkstation): boolean => !dGuardWorkstationGuidSet.has(`${ workstation.guid }_${ id }`))
              .map((workstation: IWorkstation.IWorkstation): { guid: string; server_id: number; } => ({ guid: workstation.guid, server_id: id }));
              
            if (dGuardWorkstationCreationList.length > 0) {
              await prisma.d_guard_workstations.createMany(
                {
                  data: dGuardWorkstationCreationList,
                  skipDuplicates: true
                }
              );
            }
          
            const dGuardWorkstationListB = await prisma.d_guard_workstations.findMany(
              {
                where: {
                  guid: { in: workstationGuidList },
                  server_id: id
                }
              }
            );
 
            const dGuardWorkstationMap = new Map<string, IDGuardWorkstation.IDGuardWorkstation>(dGuardWorkstationListB.map((dGuardWorkstation: IDGuardWorkstation.IDGuardWorkstation): [string, IDGuardWorkstation.IDGuardWorkstation] => [dGuardWorkstation.guid, dGuardWorkstation]));
          
            return workstationList.map(
              (workstation: IWorkstation.IWorkstation): IUser.IUser | null => {
                const dGuardWorkstation = dGuardWorkstationMap.get(workstation.guid);
                
                return dGuardWorkstation ? { id: dGuardWorkstation.id, name: workstation.name, guid: workstation.guid } : null;
              }
            ).filter(Boolean) as IUser.IUser[];
          } catch (error: unknown) {
            console.log(`Service | Timestamp: ${ timestamp } | Name: users | Error: ${ error instanceof Error ? error.message : String(error) }`);

            return [];
          }
        }
      )
    );

    return {
      status: 200,
      data: userList.flat().reduce(
        (accumulator: IUser.IUser[], userA: IUser.IUser) => {
          const isDuplicate = accumulator.some((userB: IUser.IUser): boolean => userA.guid === userB.guid);
          
          if (!isDuplicate) {
            accumulator.push({ id: userA.id, name: userA.name });
          }
  
          return accumulator;
        },
        [] as IUser.IUser[]
      ).sort(
        (a: IUser.IUser, b: IUser.IUser): number => {
          if (a.name > b.name) {
            return 1;
          }

          if (a.name < b.name) {
            return -1;
          }

          return 0;
        }
      )
    };
  } catch (error: unknown) {
    console.log(`Service | Timestamp: ${ timestamp } | Name: users | Error: ${ error instanceof Error ? error.message : String(error) }`);

    return {
      status: 500,
      data: []
    };
  }
};
