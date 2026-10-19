import { HttpException } from '@exceptions/HttpException';
import { NextFunction, Request, Response } from 'express';

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (req.isAuthenticated()) {
      next();
    } else {
      next(new HttpException(401, 'NOT_AUTHORIZED'));
    }
  } catch {
    next(new HttpException(401, 'AUTH_FAILED'));
  }
};

export default authMiddleware;
