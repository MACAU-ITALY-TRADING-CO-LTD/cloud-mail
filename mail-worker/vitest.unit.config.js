import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['test/file-utils.spec.js', 'test/att-service.spec.js', 'test/i18n.spec.js'],
	},
});
