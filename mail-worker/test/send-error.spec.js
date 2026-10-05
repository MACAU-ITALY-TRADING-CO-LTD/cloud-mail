import { describe, expect, it } from 'vitest';
import { isOversizedSendError } from '../../mail-vue/src/utils/send-error.js';

describe('oversized send errors', () => {
    it('recognizes an HTTP 413 even when the response is an HTML page', () => {
        expect(isOversizedSendError({ response: { status: 413, data: '<html>Request Entity Too Large</html>' }, code: 'ERR_BAD_REQUEST' })).toBe(true);
        expect(isOversizedSendError({ status: 413 })).toBe(true);
        expect(isOversizedSendError({ code: 413, message: 'Too large' })).toBe(true);
    });

    it('recognizes size errors returned by the sending service', () => {
        expect(isOversizedSendError({ message: 'Email size exceeds the maximum allowed size.' })).toBe(true);
        expect(isOversizedSendError({ response: { status: 422, data: { message: 'Payload too large' } } })).toBe(true);
        expect(isOversizedSendError({ message: 'Request failed with status code 413' })).toBe(true);
    });

    it('does not mislabel unrelated failures as oversized attachments', () => {
        for (const error of [null, {}, { code: 'ERR_BAD_REQUEST', response: { status: 400 } },
            { message: 'attachment filename field must be a string' }, { message: 'Network Error' },
            { code: 403, message: 'Sending is disabled' }]) {
            expect(isOversizedSendError(error)).toBe(false);
        }
    });
});
