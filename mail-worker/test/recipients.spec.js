import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAddresses, replyRecipients } from '../../mail-vue/src/utils/recipients';
import { normalizeRecipients } from '../src/utils/recipients';
import emailService from '../src/service/email-service';
import settingService from '../src/service/setting-service';
import attService from '../src/service/att-service';
import userService from '../src/service/user-service';
import roleService from '../src/service/role-service';

const addresses = (...values) => JSON.stringify(values.map(address => ({ address, name: '' })));
const message = {
  sendEmail: 'supplier@example.com',
  recipient: addresses('me@example.com', 'buyer@example.com'),
  cc: addresses('logistics@example.com', 'BUYER@example.com', 'ME@example.com'),
  bcc: addresses('private@example.com'),
};

afterEach(() => vi.restoreAllMocks());

describe('reply recipients', () => {
  it('keeps ordinary reply limited to the sender', () => {
    expect(replyRecipients(message, ['me@example.com'])).toEqual({ to: ['supplier@example.com'], cc: [] });
  });
  it('preserves To/Cc roles, excludes self and duplicates, never copies Bcc', () => {
    expect(replyRecipients(message, ['me@example.com'], true)).toEqual({
      to: ['supplier@example.com', 'buyer@example.com'], cc: ['logistics@example.com'],
    });
  });
  it('supports a user who received the message through Cc', () => {
    expect(replyRecipients(message, ['logistics@example.com'], true)).toEqual({
      to: ['supplier@example.com', 'me@example.com', 'buyer@example.com'], cc: [],
    });
  });
  it('excludes both the selected alias and primary account', () => {
    expect(replyRecipients(message, ['supplier@example.com', 'me@example.com'], true).to)
      .toEqual(['buyer@example.com']);
  });
  it('handles legacy empty or malformed fields without breaking the reader', () => {
    for (const value of [null, undefined, '', 'broken', '{}', '[null,{}]']) expect(parseAddresses(value)).toEqual([]);
    expect(replyRecipients({sendEmail: 'sender@example.com'}, [], true)).toEqual({to: ['sender@example.com'], cc: []});
  });
  it('supports PostalMime address groups and preserves names', () => {
    expect(parseAddresses([{ name: 'Team', group: [{address: ' a@example.com ', name: 'Alice'}] }]))
      .toEqual([{address: 'a@example.com', name: 'Alice'}]);
  });
});

describe('outbound Cc', () => {
  it('normalizes old and new clients and deduplicates across To and Cc', () => {
    expect(normalizeRecipients(['a@example.com'])).toEqual({to: ['a@example.com'], cc: []});
    expect(normalizeRecipients([' a@example.com ', 'A@example.com'], ['A@example.com', 'b@example.com']))
      .toEqual({to: ['a@example.com'], cc: ['b@example.com']});
  });
  it.each([null, 'a@example.com', [null], ['invalid'], ['a@example.com\r\nBcc: leak@example.com']])('rejects invalid Cc %j', cc => {
    expect(() => normalizeRecipients(['a@example.com'], cc)).toThrow();
  });
  it('requires a To recipient', () => expect(() => normalizeRecipients([], ['b@example.com'])).toThrow());
  it('passes Cc and thread headers to Cloudflare separately from To', async () => {
    const send = vi.fn().mockResolvedValue({messageId: 'test'});
    await emailService.sendByCloudflareEmail({env: {email: {send}}}, {
      accountEmail: 'me@example.com', name: 'Me', receiveEmail: ['a@example.com'], cc: ['b@example.com'],
      subject: 'Test', text: 'Test', attachments: [], sendType: 'reply', messageId: '<original@example.com>',
    });
    expect(send.mock.calls[0][0]).toMatchObject({to: ['a@example.com'], cc: ['b@example.com'], headers: {'in-reply-to': '<original@example.com>'}});
  });
  it('passes Cc to the real Resend SDK request boundary', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({id: 'test'}), {status: 200}));
    await emailService.sendByResend('test-key', {
      accountEmail: 'me@example.com', name: 'Me', receiveEmail: ['a@example.com'], cc: ['b@example.com'],
      subject: 'Test', text: 'Test', attachments: [], sendType: 'reply', messageId: '<original@example.com>',
    });
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({to: ['a@example.com'], cc: ['b@example.com'], headers: {'in-reply-to': '<original@example.com>'}});
  });
  function prepareSend(role) {
    vi.spyOn(settingService, 'query').mockResolvedValue({send: 0, domainList: ['@example.com'], resendTokens: {}});
    vi.spyOn(attService, 'toImageUrlHtml').mockResolvedValue({imageDataList: [], html: '<p>Test</p>'});
    vi.spyOn(userService, 'selectById').mockResolvedValue({email: 'me@example.com', type: 1, sendCount: 0});
    vi.spyOn(roleService, 'selectById').mockResolvedValue(role);
  }
  it('applies internal-only restrictions to external Cc', async () => {
    prepareSend({sendType: 'internal'});
    await expect(emailService.send({env: {admin: 'admin@example.com'}}, {
      receiveEmail: ['a@example.com'], cc: ['b@external.test'], content: '<p>Test</p>',
    }, 1)).rejects.toMatchObject({code: 403});
  });
  it('includes Cc in recipient quota checks', async () => {
    prepareSend({sendType: 'count', sendCount: 1});
    await expect(emailService.send({env: {admin: 'admin@example.com'}}, {
      receiveEmail: ['a@example.com'], cc: ['b@example.com'], content: '<p>Test</p>',
    }, 1)).rejects.toThrow();
  });
});
