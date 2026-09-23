import { afterEach, describe, expect, it, vi } from 'vitest';
import BizError from '../src/error/biz-error';
import userService from '../src/service/user-service';
import settingService from '../src/service/setting-service';
import verifyRecordService from '../src/service/verify-record-service';
import r2Service from '../src/service/r2-service';
import emailHtmlTemplate from '../src/template/email-html';

afterEach(() => vi.restoreAllMocks());

describe('selected upstream safety fixes', () => {
	it('rejects a short reset password before writing it', async () => {
		await expect(userService.resetPassword({}, { password: 'abc' }, 1))
			.rejects.toBeInstanceOf(BizError);
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
	});
});
