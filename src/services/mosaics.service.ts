import { NextFunction, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client/storage/client.js';
import { cryptographyUtil, HttpClientUtil, BasicAndBearerStrategy } from '../../expressium/src/index.js';
import { IResponse } from '../interfaces/index.js';
import { IDGuardLayout, IDGuardServer, ILayout, IMosaic } from './interfaces/index.js';

const prisma = new PrismaClient();

export const mosaics = async (
  _req: Request, 
  _res: Response, 
  _next: NextFunction, 
  timestamp: string
): Promise<IResponse.IResponse<IMosaic.IMosaic[]>> => {
  try {
    const dGuardServerList = await prisma.d_guard_servers.findMany();
    
    const mosaicList = await Promise.all(
      dGuardServerList.map(
        async ({ id, ip, port, username, password }: IDGuardServer.IDGuardServer): Promise<IMosaic.IMosaic[]> => {
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
                (response: Axios.AxiosXHR<{ login: { userToken: string; }; }>): string => response.data?.login?.userToken
              )
            );
          
            const serverApiVirtualMatrixLayouts = await httpClientInstance.get<{ layouts: ILayout.ILayout[]; }>(`http://${ ip }:${ port }/api/virtual-matrix/layouts`);      
            const layoutList = serverApiVirtualMatrixLayouts.data.layouts;
            const layoutGuidList = layoutList.map((layout: ILayout.ILayout): string => layout.guid);
            
            if (layoutGuidList.length > 0) {
              await prisma.d_guard_layouts.deleteMany(
                {
                  where: {
                    guid: { notIn: layoutGuidList },
                    server_id: id
                  }
                }
              );
            }

            const dGuardLayoutListA = await prisma.d_guard_layouts.findMany(
              {
                where: {
                  guid: { in: layoutGuidList },
                  server_id: id
                }
              }
            );
            
            const dGuardLayoutGuidSet = new Set<string>(dGuardLayoutListA.map((dGuardLayout: IDGuardLayout.IDGuardLayout): string => `${ dGuardLayout.guid }_${ dGuardLayout.server_id }`));
            
            const dGuardLayoutCreationList = layoutList
              .filter((layout: ILayout.ILayout): boolean => !dGuardLayoutGuidSet.has(`${ layout.guid }_${ id }`))
              .map((layout: ILayout.ILayout): { guid: string; server_id: number; } => ({ guid: layout.guid, server_id: id }));
            
            if (dGuardLayoutCreationList.length > 0) {
              await prisma.d_guard_layouts.createMany(
                {
                  data: dGuardLayoutCreationList,
                  skipDuplicates: true
                }
              );
            }
          
            const dGuardLayoutListB = await prisma.d_guard_layouts.findMany(
              {
                where: {
                  guid: { in: layoutGuidList },
                  server_id: id
                }
              }
            );
          
            const dGuardLayoutMap = new Map<string, IDGuardLayout.IDGuardLayout>(dGuardLayoutListB.map((dGuardLayout: IDGuardLayout.IDGuardLayout): [string, IDGuardLayout.IDGuardLayout] => [dGuardLayout.guid, dGuardLayout]));
          
            return layoutList.map(
              (layout: ILayout.ILayout): IMosaic.IMosaic | null => {
                const dGuardLayout = dGuardLayoutMap.get(layout.guid);
                
                return dGuardLayout ? { id: dGuardLayout.id, name: layout.name } : null;
              }
            ).filter(Boolean) as IMosaic.IMosaic[];
          } catch (error: unknown) {
            console.log(`Error | Timestamp: ${ timestamp } | Path: src/services/mosaics.service.ts | Location: mosaics | Error: ${ error instanceof Error ? error.message : String(error) }`);

            return [];
          }
        }
      )
    );

    return {
      status: 200,
      data: mosaicList
        .flat()
        .sort(
          (a: IMosaic.IMosaic, b: IMosaic.IMosaic): number => {
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
    console.log(`Error | Timestamp: ${ timestamp } | Path: src/services/mosaics.service.ts | Location: mosaics | Error: ${ error instanceof Error ? error.message : String(error) }`);

    return {
      status: 500,
      data: []
    };
  }
};
