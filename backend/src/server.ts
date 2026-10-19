// DTO decorators may run while importing startup configuration.
import 'reflect-metadata';

import { createSessionStore } from '@utils/session-store';
import validateEnv from '@utils/validateEnv';

import App from './app';
import { CONTROLLERS } from './controllers';

validateEnv();

(async () => {
  const sessionStore = await createSessionStore();

  const app = new App(CONTROLLERS, sessionStore);

  app.listen();
})();
