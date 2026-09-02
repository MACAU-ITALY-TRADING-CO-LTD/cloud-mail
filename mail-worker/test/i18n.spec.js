import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import workerEn from '../src/i18n/en.js';
import workerIt from '../src/i18n/it.js';
import workerZh from '../src/i18n/zh.js';
import vueEn from '../../mail-vue/src/i18n/en.js';
import vueIt from '../../mail-vue/src/i18n/it.js';
import vueZh from '../../mail-vue/src/i18n/zh.js';

function flattenMessages(messages, prefix = '') {
	return Object.entries(messages).reduce((result, [key, value]) => {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === 'object') {
			Object.assign(result, flattenMessages(value, path));
		} else {
			result[path] = value;
		}
		return result;
	}, {});
}

function placeholders(value) {
	return [...String(value).matchAll(/\{\{?[a-zA-Z0-9_]+\}?\}/g)]
		.map(match => match[0])
		.sort();
}

function expectCompleteTranslation(source, translation) {
	const sourceMessages = flattenMessages(source);
	const translatedMessages = flattenMessages(translation);

	expect(Object.keys(translatedMessages).sort()).toEqual(Object.keys(sourceMessages).sort());
	for (const key of Object.keys(sourceMessages)) {
		expect(placeholders(translatedMessages[key]), `placeholder mismatch at ${key}`)
			.toEqual(placeholders(sourceMessages[key]));
	}
}

describe('Italian translations', () => {
	it('covers every frontend message and preserves placeholders', () => {
		expectCompleteTranslation(vueEn, vueIt);
		expectCompleteTranslation(vueEn, vueZh);
		expect(vueIt.delInputPattern).toBe('DELETE');
		expect(vueIt.clearAllDelConfirm).toContain('DELETE');
	});

	it('covers every Worker message and permission label', () => {
		expectCompleteTranslation(workerEn, workerIt);
		expectCompleteTranslation(workerEn, workerZh);
	});

	it('ships the Italian TinyMCE 7 language pack', async () => {
		const languagePackPath = fileURLToPath(
			new URL('../../mail-vue/public/tinymce/langs/it.js', import.meta.url),
		);
		const languagePack = await readFile(languagePackPath, 'utf8');
		expect(languagePack).toContain('tinymce.addI18n("it"');
	});
});
