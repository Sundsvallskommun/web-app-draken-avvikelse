import { User } from '@interfaces/users.interface';
import { Request } from 'express';

export interface RequestWithUser extends Request {
  user: User;
}
