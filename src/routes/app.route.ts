import { expressiumRoute, loggerUtil } from '../../expressium/index.js';
import { clientsController, getHealthController, mosaicsController, showMosaicController, usersController } from '../controllers/index.js';

export const buildRoutes = (): void => {
  try {
    expressiumRoute.generateRoute(
      'get',
      '/v1/clients',
      [],
      clientsController.clients
    );

    expressiumRoute.generateRoute(
      'get',
      '/v1/get/health',
      [],
      getHealthController.getHealth,
      true
    );

    expressiumRoute.generateRoute(
      'get',
      '/v1/mosaics',
      [],
      mosaicsController.mosaics
    );

    expressiumRoute.generateRoute(
      'post',
      '/v1/showMosaic',
      [],
      showMosaicController.showMosaic
    );

    expressiumRoute.generateRoute(
      'get',
      '/v1/users',
      [],
      usersController.users
    );
  } catch (error: unknown) {
    loggerUtil.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};
