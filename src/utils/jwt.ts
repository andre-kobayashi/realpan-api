import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET não configurado');
}

export const generateToken = (payload: any): string => {
  // @ts-ignore - Bypass TypeScript check
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): any => {
  // @ts-ignore - Bypass TypeScript check
  return jwt.verify(token, JWT_SECRET);
};
