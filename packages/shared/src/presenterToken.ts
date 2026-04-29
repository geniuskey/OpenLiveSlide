import { SignJWT, jwtVerify } from 'jose';

export interface PresenterTokenPayload {
  sessionId: string;
  userId: string;
}

const ISSUER = 'openliveslide';
const AUDIENCE = 'realtime';

function secretBytes(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signPresenterToken(
  payload: PresenterTokenPayload,
  secret: string,
  ttlSeconds = 60 * 60 * 12,
): Promise<string> {
  return new SignJWT({ sid: payload.sessionId, uid: payload.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretBytes(secret));
}

export async function verifyPresenterToken(
  token: string,
  secret: string,
): Promise<PresenterTokenPayload> {
  const { payload } = await jwtVerify(token, secretBytes(secret), {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (typeof payload.sid !== 'string' || typeof payload.uid !== 'string') {
    throw new Error('Invalid presenter token payload');
  }
  return { sessionId: payload.sid, userId: payload.uid };
}
