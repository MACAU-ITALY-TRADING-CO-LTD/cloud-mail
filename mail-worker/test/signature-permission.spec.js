import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import jwtUtils from '../src/utils/jwt-utils';
import signatureService from '../src/service/signature-service';
let app;
beforeAll(async () => {
  await import('../src/security/security');
  await import('../src/api/account-api');
  app = (await import('../src/hono/hono')).default;
});
afterEach(() => vi.restoreAllMocks());
function request(method, body) {
  const env = { kv: { get: vi.fn().mockResolvedValue({ tokens: ['test'], user: { userId: 7 }, refreshTime: new Date().toISOString() }) } };
  return app.request(method === 'GET' ? '/account/signatures' : '/account/signature', {
    method, headers: { 'Content-Type': 'application/json' }, ...(body ? {body: JSON.stringify(body)} : {})
  }, env).then(r => r.json());
}
describe('signature endpoints use authenticated identity', () => {
  it('rejects unauthenticated reads and writes', async () => {
    vi.spyOn(jwtUtils, 'verifyToken').mockResolvedValue(null);
    const list = vi.spyOn(signatureService, 'list');
    const save = vi.spyOn(signatureService, 'save');
    expect((await request('GET')).code).toBe(401);
    expect((await request('PUT', {})).code).toBe(401);
    expect(list).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
  it('uses the session user, never a userId supplied in the request', async () => {
    vi.spyOn(jwtUtils, 'verifyToken').mockResolvedValue({ userId: 7, token: 'test' });
    const save = vi.spyOn(signatureService, 'save').mockResolvedValue({ html: '<p>Test</p>' });
    expect((await request('PUT', { userId: 99, accountId: 1, html: '<p>Test</p>', autoNew: true, autoReplyForward: false })).code).toBe(200);
    expect(save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: 99 }), 7);
  });
});
