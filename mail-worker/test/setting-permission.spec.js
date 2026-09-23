import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import jwtUtils from '../src/utils/jwt-utils';
import permService from '../src/service/perm-service';
import settingService from '../src/service/setting-service';

let app;
beforeAll(async () => {
	await import('../src/security/security');
	await import('../src/api/setting-api');
	app = (await import('../src/hono/hono')).default;
});

afterEach(() => vi.restoreAllMocks());

function request() {
	const authInfo = {
		tokens: ['local-test-token'],
		user: { userId: 7, email: 'staff@example.test' },
		refreshTime: new Date().toISOString()
	};
	const env = {
		admin: 'admin@example.test',
		kv: { get: vi.fn().mockResolvedValue(authInfo) }
	};
	return app.request('/setting/setBlacklist', {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ blackSubject: 'local-test' })
	}, env).then(response => response.json());
}

describe('blacklist settings permission', () => {
	it('blocks a signed-in user who lacks setting:set', async () => {
		vi.spyOn(jwtUtils, 'verifyToken').mockResolvedValue({ userId: 7, token: 'local-test-token' });
		vi.spyOn(permService, 'userPermKeys').mockResolvedValue(['setting:query']);
		const setBlacklist = vi.spyOn(settingService, 'setBlacklist').mockResolvedValue({});
		expect((await request()).code).toBe(403);
		expect(setBlacklist).not.toHaveBeenCalled();
	});

	it('allows a signed-in user with setting:set', async () => {
		vi.spyOn(jwtUtils, 'verifyToken').mockResolvedValue({ userId: 7, token: 'local-test-token' });
		vi.spyOn(permService, 'userPermKeys').mockResolvedValue(['setting:set']);
		const setBlacklist = vi.spyOn(settingService, 'setBlacklist').mockResolvedValue({ blackSubject: 'local-test' });
		expect((await request()).code).toBe(200);
		expect(setBlacklist).toHaveBeenCalledOnce();
	});
});
