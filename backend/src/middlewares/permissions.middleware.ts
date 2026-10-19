import { HttpException } from '@exceptions/HttpException';
import { RequestWithUser } from '@interfaces/auth.interface';
import { Permissions } from '@interfaces/users.interface';
import { logger } from '@utils/logger';
import { NextFunction, Response } from 'express';

export const hasPermissions = (permissions: Array<keyof Permissions>) => async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const userPermissions = req.user?.permissions || [];
  if (permissions.every(permission => userPermissions[permission])) {
    next();
  } else {
    logger.error('Missing permissions');
    next(new HttpException(403, 'Missing permissions'));
  }
};
