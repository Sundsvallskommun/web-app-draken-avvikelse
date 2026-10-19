import { User } from '@interfaces/users.interface';

declare module 'express-session' {
  interface Session {
    returnTo?: string;
    user?: User;
    passport?: any;
    messages: string[];
  }
}
