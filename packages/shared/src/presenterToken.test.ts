import { describe, it, expect } from 'vitest';
import { signPresenterToken, verifyPresenterToken } from './presenterToken.js';

const SECRET = 'a'.repeat(64);

describe('presenterToken', () => {
  it('round-trips a signed token', async () => {
    const token = await signPresenterToken({ sessionId: 'sess_1', userId: 'usr_1' }, SECRET);
    const claims = await verifyPresenterToken(token, SECRET);
    expect(claims).toEqual({ sessionId: 'sess_1', userId: 'usr_1' });
  });

  it('rejects tokens signed with a different secret', async () => {
    const token = await signPresenterToken({ sessionId: 's', userId: 'u' }, SECRET);
    await expect(verifyPresenterToken(token, 'b'.repeat(64))).rejects.toThrow();
  });

  it('rejects expired tokens', async () => {
    const token = await signPresenterToken({ sessionId: 's', userId: 'u' }, SECRET, -1);
    await expect(verifyPresenterToken(token, SECRET)).rejects.toThrow();
  });

  it('rejects malformed tokens', async () => {
    await expect(verifyPresenterToken('not-a-jwt', SECRET)).rejects.toThrow();
  });
});
