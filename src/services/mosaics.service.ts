import momentTimezone from 'moment-timezone';
import { PrismaClient } from '@prisma/client/storage/client.js';
import { cryptographyUtil, HttpClientUtil, BasicAndBearerStrategy } from '../../expressium/src/index.js';
import { IDGuardServer, IDGuardLayout, ILayoutCreationMap, ILayoutMap, ILayoutMapList, ILogin, IMosaic, IResponse } from './interfaces/index.js';

const prisma = new PrismaClient();

export const mosaics = async (): Promise<IResponse.IResponse<IMosaic.IMosaic[]>> => {
  try {
    const dGuardServerList = await prisma.d_guard_servers.findMany();
        
    const mosaicList = await Promise.all(
      dGuardServerList.map(
        async (dGuardServer: IDGuardServer.IDGuardServer): Promise<IMosaic.IMosaic[]> => {
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
          
            const layoutMapList = (await httpClientInstance.get<ILayoutMapList.ILayoutMapList>(`http://${ ip }:${ port }/api/virtual-matrix/layouts`)).data;      
            const layoutMapGuidList = layoutMapList.layouts.map((layoutMap: ILayoutMap.ILayoutMap): string => layoutMap.guid);
            
            if (layoutMapGuidList.length > 0) {
              await prisma.d_guard_layouts.deleteMany(
                {
                  where: {
                    guid: { notIn: layoutMapGuidList },
                    d_guard_servers_id: id
                  }
                }
              );
            }
            
            let dGuardLayoutList = await prisma.d_guard_layouts.findMany(
              {
                where: {
                  guid: { in: layoutMapGuidList },
                  d_guard_servers_id: id
                }
              }
            );
            
            const dGuardLayoutGuidSet = new Set<string>(dGuardLayoutList.map((dGuardLayout: IDGuardLayout.IDGuardLayout): string => `${ dGuardLayout.guid }_${ dGuardLayout.d_guard_servers_id }`));

            const layoutCreationMapList = layoutMapList.layouts
              .filter((layoutMap: ILayoutMap.ILayoutMap): boolean => !dGuardLayoutGuidSet.has(`${ layoutMap.guid }_${ id }`))
              .map((layoutMap: ILayoutMap.ILayoutMap): ILayoutCreationMap.ILayoutCreationMap => ({ guid: layoutMap.guid, d_guard_servers_id: id }));
              
            if (layoutCreationMapList.length > 0) {
              await prisma.d_guard_layouts.createMany(
                {
                  data: layoutCreationMapList,
                  skipDuplicates: true
                }
              );
            }
          
            dGuardLayoutList = await prisma.d_guard_layouts.findMany(
              {
                where: {
                  guid: { in: layoutMapGuidList },
                  d_guard_servers_id: id
                }
              }
            );
  
            const dGuardLayoutMap = new Map<string, IDGuardLayout.IDGuardLayout>(dGuardLayoutList.map((dGuardLayout: IDGuardLayout.IDGuardLayout): [string, IDGuardLayout.IDGuardLayout] => [dGuardLayout.guid, dGuardLayout]));
          
            return layoutMapList.layouts.map(
              (layoutMap: ILayoutMap.ILayoutMap): IMosaic.IMosaic | null => {
                const dGuardLayout = dGuardLayoutMap.get(layoutMap.guid);
                
                return dGuardLayout 
                  ? { 
                      id: dGuardLayout.id, 
                      name: layoutMap.name
                    } 
                  : null;
              }
            ).filter(Boolean) as IMosaic.IMosaic[];
          } catch (error: unknown) {
            console.log(`Error | Timestamp: ${ momentTimezone().utc().format('DD-MM-YYYY HH:mm:ss') } | Path: src/services/mosaics.service.ts | Location: mosaics | Error: ${ error instanceof Error ? error.message : String(error) }`);

            return [];
          }
        }
      )
    );

    return {
      status: 200,
      data: mosaicList
        .flat()
        .sort((mosaicA: IMosaic.IMosaic, mosaicB: IMosaic.IMosaic): number => mosaicA.name.localeCompare(mosaicB.name))
    };
  } catch (error: unknown) {
    console.log(`Error | Timestamp: ${ momentTimezone().utc().format('DD-MM-YYYY HH:mm:ss') } | Path: src/services/mosaics.service.ts | Location: mosaics | Error: ${ error instanceof Error ? error.message : String(error) }`);

    return {
      status: 500,
      data: []
    };
  }
};
