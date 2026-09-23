import { afterEach, describe, expect, it, vi } from 'vitest';
import BizError from '../src/error/biz-error';
import userService from '../src/service/user-service';
import settingService from '../src/service/setting-service';
import verifyRecordService from '../src/service/verify-record-service';
import r2Service from '../src/service/r2-service';
import emailHtmlTemplate from '../src/template/email-html';
import roleService from '../src/service/role-service';
import oauthService from '../src/service/oauth-service';
import aiService from '../src/service/ai-service';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('selected upstream safety fixes', () => {
	it('rejects a short reset password before writing it', async () => {
		for (const password of ['', 'abc', '12345']) {
			await expect(userService.resetPassword({}, { password }, 1))
				.rejects.toBeInstanceOf(BizError);
		}
	});

	it('does not return any part of a configured Telegram bot token', async () => {
		vi.spyOn(settingService, 'query').mockResolvedValue({
			resendTokens: {},
			tgBotToken: '123456789:private-test-token',
			secretKey: null,
			s3AccessKey: null,
			s3SecretKey: null
		});
		vi.spyOn(verifyRecordService, 'selectListByIP').mockResolvedValue([]);
		vi.spyOn(r2Service, 'storageType').mockResolvedValue('R2');

		const setting = await settingService.get({ env: {} });
		expect(setting.tgBotToken).toBe('********');
		expect(JSON.stringify(setting)).not.toContain('private-test-token');
	});

	it('keeps quoted email HTML from breaking out of its script element', () => {
		const html = '<img alt="</script><script>globalThis.injected=1</script>">';
		const page = emailHtmlTemplate(html, 'files.example.com');
		expect(page.match(/<script\b/gi)).toHaveLength(1);
		expect(page).toContain('\\u003C');
		const inlineScript = page.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
		expect(() => new Function(inlineScript)).not.toThrow();
	});

	it('keeps quotes, backticks and interpolation text intact in quoted HTML', () => {
		const page = emailHtmlTemplate('<p title="say \'hello\'">` ${test} 中文</p>', 'files.example.com');
		const inlineScript = page.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
		expect(() => new Function(inlineScript)).not.toThrow();
		expect(page).toContain('${test}');
	});

	it('does not query roles for an empty recipient list', () => {
		expect(roleService.selectByUserIds({}, [])).toEqual([]);
		expect(roleService.selectByUserIds({}, null)).toEqual([]);
	});

	it('maps OAuth silenced independently of active status', async () => {
		const fetchMock = vi.fn()
			.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'local-test' }) })
			.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 12, active: true, silenced: true }) })
			.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'local-test' }) })
			.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 12, active: false, silenced: false }) });
		vi.stubGlobal('fetch', fetchMock);
		const saveUser = vi.spyOn(oauthService, 'saveUser').mockResolvedValue({ userId: 1 });
		vi.spyOn(userService, 'selectByIdIncludeDel').mockResolvedValue(null);
		const context = { env: { linuxdo_client_id: 'test', linuxdo_client_secret: 'test', linuxdo_callback_url: 'https://example.test' } };

		await oauthService.linuxDoLogin(context, { code: 'local' });
		await oauthService.linuxDoLogin(context, { code: 'local' });

		expect(saveUser.mock.calls[0][1]).toMatchObject({ active: 0, silenced: 0 });
		expect(saveUser.mock.calls[1][1]).toMatchObject({ active: 1, silenced: 1 });
	});

	it('does not call AI when code extraction is disabled', async () => {
		const run = vi.fn();
		const code = await aiService.extractCode({ env: { ai: { run } } },
			{ subject: 'Your code is 123456', from: { address: 'service@example.test' } },
			{ aiCode: 1 });
		expect(code).toBe('');
		expect(run).not.toHaveBeenCalled();
	});

	it('uses the supported fast model when code extraction is enabled', async () => {
		const run = vi.fn().mockResolvedValue({ response: '{"code":"123456"}' });
		const code = await aiService.extractCode({ env: { ai: { run } } },
			{ subject: 'Your code is 123456', from: { address: 'service@example.test' } },
			{ aiCode: 0 });
		expect(code).toBe('123456');
		expect(run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct-fast', expect.any(Object));
	});
});
