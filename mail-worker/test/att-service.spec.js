import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	attachment: null,
	object: null,
	filters: []
}));

vi.mock('drizzle-orm', async (importOriginal) => {
	const actual = await importOriginal();

	return {
		...actual,
		and: (...filters) => filters,
		eq: (column, value) => ({ operation: 'eq', column: column.name, value }),
		isNull: (column) => ({ operation: 'isNull', column: column.name })
	};
});

vi.mock('../src/entity/orm', () => ({
	default: () => ({
		select: () => ({
			from: () => ({
				where: (filters) => {
					state.filters = filters;

					return {
						get: async () => {
							const row = state.attachment;
							if (!row) return null;

							const fields = {
								att_id: 'attId',
								type: 'type',
								user_id: 'userId',
								content_id: 'contentId'
							};

							const matches = filters.every((filter) => {
								const field = fields[filter.column];
								if (filter.operation === 'eq') return row[field] === filter.value;
								if (filter.operation === 'isNull') return row[field] == null;
								return true;
							});

							return matches ? row : null;
						}
					};
				}
			})
		})
	})
}));

vi.mock('../src/service/r2-service', () => ({
	default: {
		getObj: vi.fn(async () => state.object)
	}
}));

import attService from '../src/service/att-service';

describe('attService.download', () => {
	beforeEach(() => {
		state.attachment = {
			attId: 146,
			userId: 6,
			type: 0,
			contentId: '<f_mtd003p30>',
			key: 'attachments/matese.pdf'
		};
		state.object = { body: new Uint8Array([1, 2, 3]) };
		state.filters = [];
	});

	it('downloads an owned ordinary attachment even when the sender supplied a Content-ID', async () => {
		const result = await attService.download({}, 146, 6);

		expect(result).toEqual({
			attachment: state.attachment,
			object: state.object
		});
		expect(state.filters).not.toContainEqual(
			expect.objectContaining({ operation: 'isNull', column: 'content_id' })
		);
	});

	it('does not expose the attachment to another user', async () => {
		await expect(attService.download({}, 146, 7)).resolves.toBeNull();
	});

	it('preserves the explicit admin access path', async () => {
		const result = await attService.download({}, 146, 7, true);

		expect(result).toEqual({
			attachment: state.attachment,
			object: state.object
		});
	});

	it('does not expose embedded attachment rows', async () => {
		state.attachment.type = 1;

		await expect(attService.download({}, 146, 6)).resolves.toBeNull();
	});

	it('returns null when the stored object is missing', async () => {
		state.object = null;

		await expect(attService.download({}, 146, 6)).resolves.toBeNull();
	});
});
