import { describe, expect, it } from 'vitest';
import fileUtils from '../src/utils/file-utils';

describe('fileUtils.contentDisposition', () => {
	it('preserves a safe ASCII filename', () => {
		expect(fileUtils.contentDisposition('report.pdf')).toBe(
			'attachment; filename="report.pdf"; filename*=UTF-8\'\'report.pdf'
		);
	});

	it('provides an ASCII fallback and UTF-8 filename', () => {
		expect(fileUtils.contentDisposition('报价单 2026.xlsx')).toBe(
			'attachment; filename="2026.xlsx"; filename*=UTF-8\'\'%E6%8A%A5%E4%BB%B7%E5%8D%95%202026.xlsx'
		);
	});

	it('removes response-header control characters', () => {
		const header = fileUtils.contentDisposition('report.pdf\r\nX-Test: injected');

		expect(header).not.toContain('\r');
		expect(header).not.toContain('\n');
		expect(header).toContain('filename="report.pdf__X-Test_ injected"');
	});
});
