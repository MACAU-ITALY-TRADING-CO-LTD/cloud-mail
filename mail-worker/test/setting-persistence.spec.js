import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ row: null }));

vi.mock('../src/entity/orm', () => ({
	default: () => ({
		select: () => ({ from: () => ({ get: async () => ({ ...database.row }) }) }),
		update: () => ({
			set: (changes) => ({
				returning: () => ({ get: async () => Object.assign(database.row, changes) })
			})
		})
	})
}));

import settingService from '../src/service/setting-service';

beforeEach(() => {
	database.row = {
		resendTokens: '{}',
		emailPrefixFilter: '',
		tgBotToken: 'original-local-token',
		tgBotStatus: 0
	};
});

function context() {
	const cache = new Map();
	const state = new Map();
	return {
		env: {
			domain: ['example.test'],
			kv: {
				get: async key => JSON.parse(cache.get(key) ?? 'null'),
				put: async (key, value) => cache.set(key, value)
			}
		},
		get: key => state.get(key),
		set: (key, value) => state.set(key, value)
	};
}

describe('Telegram settings persistence', () => {
	it('keeps an existing token when other settings are saved', async () => {
		const c = context();
		await settingService.refresh(c);
		await settingService.set(c, { tgBotStatus: 1 });
		expect(database.row.tgBotToken).toBe('original-local-token');
		expect(database.row.tgBotStatus).toBe(1);
	});

	it('replaces the token only when an explicit new token is submitted', async () => {
		const c = context();
		await settingService.refresh(c);
		await settingService.set(c, { tgBotToken: 'replacement-local-token' });
		expect(database.row.tgBotToken).toBe('replacement-local-token');
	});
});
