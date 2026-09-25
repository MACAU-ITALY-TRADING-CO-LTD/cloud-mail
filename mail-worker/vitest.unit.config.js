import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/file-utils.spec.js', 'test/att-service.spec.js', 'test/email-service.spec.js', 'test/i18n.spec.js', 'test/upstream-safety.spec.js', 'test/setting-persistence.spec.js', 'test/setting-permission.spec.js', 'test/oversize-mail-alert.spec.js'],
	},
});
