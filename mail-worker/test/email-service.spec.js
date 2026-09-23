import { describe, expect, it } from 'vitest';
import emailService from '../src/service/email-service';

describe('emailService attachment conversion', () => {
	const inlineImage = {
		filename: null,
		key: 'attachments/0123456789abcdef0123456789abcdef',
		mimeType: 'image/png',
		contentId: 'image-1',
		content: new Uint8Array([1, 2, 3]).buffer
	};

	it('sends a historical nameless inline image to Resend with a string filename', async () => {
		const [attachment] = await emailService.toResendAttachments([inlineImage]);

		expect(attachment.filename).toBe('attachment-0123456789abcdef0123456789abcdef.png');
		expect(attachment.content).toBe('AQID');
		expect(attachment.contentId).toBe('image-1');
	});

	it('sends the same image through Cloudflare Email with a string filename', async () => {
		const [attachment] = await emailService.toCloudflareAttachments([inlineImage]);

		expect(attachment.filename).toBe('attachment-0123456789abcdef0123456789abcdef.png');
		expect(attachment.type).toBe('image/png');
		expect(attachment.content).toBeInstanceOf(ArrayBuffer);
	});
});
