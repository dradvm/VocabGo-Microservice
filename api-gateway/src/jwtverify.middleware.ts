import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { PayloadToken } from 'types/payloadToken';

export function JwtVerifyMiddleware(secret: string | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!secret) {
      throw new Error('JWT_SECRET is not defined');
    }
    if (req.method === 'OPTIONS') return next();
    if (req.path.startsWith('/auth') || req.path.startsWith('/translate')) {
      // auth route không cần verify
      return next();
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const payload: PayloadToken = jwt.verify<PayloadToken>(token, secret);
      // gắn payload vào request, các service phía sau có thể dùng nếu muốn
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      req.headers['x-user-payload'] = JSON.stringify(payload);
      next();
    } catch (err) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  };
}
