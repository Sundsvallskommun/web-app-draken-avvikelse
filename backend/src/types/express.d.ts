// passport globally augments Express.Request with isAuthenticated()/logIn()/logOut(), which
// auth.middleware.ts relies on. In the app build that augmentation arrives via app.ts's
// `import passport`, but a program that only pulls in the middleware (such as the test
// tsconfig) never reaches it - reference it here, next to our own Request augmentation.
/// <reference types="passport" />

import { User } from '@interfaces/users.interface';

declare module 'express-serve-static-core' {
  export interface Request {
    user?: any | User;
  }
}
