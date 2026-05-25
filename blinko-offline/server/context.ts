import Bowser from 'bowser';
import { getTokenFromRequest } from "@server/lib/helper";
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

declare module 'express' {
  interface Request {
    user?: any;
    isAuthenticated?: () => boolean;
    login?: (user: any, callback?: (err: any) => void) => void;
    logout?: (callback?: (err: any) => void) => void;
  }
}

export interface User extends jwt.JwtPayload {
  name: string;
  sub: string;
  role: string;
  id: string;
  exp: number;
  iat: number;
  ip?: string;
  userAgent?: any;
  permissions?: string[];
  twoFactorVerified?: boolean;
}

export async function createContext(req: Request, res: Response) {
  const headers = req?.headers || {};
  const ua = headers['user-agent'] || '';
  const userAgent = ua ? Bowser.parse(ua) : null;
  
  try {
    const token = await getTokenFromRequest(req as any) as User;
    if (token?.sub) {
      // If the client authenticates via `Authorization: Bearer ...`, mirror it into an HttpOnly cookie.
      // This enables browser-native asset requests (e.g. `<img src="/api/file/...">`) to stay authorized
      // without embedding the JWT in URLs.
      try {
        const authHeader = (req.headers as any)?.authorization as string | undefined;
        const cookieHeader = (req.headers as any)?.cookie as string | undefined;
        const hasCookie = (name: string) =>
          typeof cookieHeader === 'string' && cookieHeader.split(';').some((p) => p.trim().startsWith(`${name}=`));

        if (
          typeof authHeader === 'string' &&
          authHeader.startsWith('Bearer ') &&
          !hasCookie('blinko_token') &&
          !res.headersSent
        ) {
          const tokenStr = authHeader.slice('Bearer '.length).trim();
          const isSecure =
            !!(req as any)?.secure || (req.headers && req.headers['x-forwarded-proto'] === 'https');
          res.cookie('blinko_token', tokenStr, {
            httpOnly: true,
            secure: isSecure,
            sameSite: isSecure ? 'none' : 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000,
            path: '/',
          });
        }
      } catch (error) {
        console.warn('Failed to mirror auth token cookie:', error);
      }

      return { ...token, id: token.sub, ip: req?.ip || '0.0.0.0', userAgent } as User;
    }
  } catch (error) {
    console.error('get token error:', error);
  }
  
  return { userAgent } as User;
}

export type Context = Awaited<ReturnType<typeof createContext>>;
