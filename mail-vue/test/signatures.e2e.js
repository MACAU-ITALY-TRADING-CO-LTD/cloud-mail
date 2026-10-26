import { test, expect } from '@playwright/test';

const signatures = [
  { accountId: 1, email: 'alice@example.test', name: 'Alice', html: '<p><strong>Alice</strong> — MITCO</p>', autoNew: true, autoReplyForward: false },
  { accountId: 2, email: 'bob@example.test', name: 'Bob', html: '<p><em>Bob</em> — MITCO</p>', autoNew: false, autoReplyForward: true }
];

async function setup(page, options = {}) {
  const rows = structuredClone(signatures);
  if (options.reply) rows[0].autoReplyForward = true;
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/account/signatures') {
      if (options.fail) return route.fulfill({ status: 500, json: {} });
      return route.fulfill({ json: { code: 200, data: rows } });
    }
    if (path === '/api/account/signature') {
      const body = route.request().postDataJSON();
      Object.assign(rows.find(r => r.accountId === body.accountId), body);
      return route.fulfill({ json: { code: 200, data: body } });
    }
    return route.fulfill({ json: { code: 200, data: {} } });
  });
  await page.goto('/test/signatures.html');
  await expect(page.getByRole('heading', { name: 'Email signatures' })).toBeVisible();
  await page.waitForFunction(() => window.tinymce?.get().filter(e => e.initialized).length === 2);
  return { rows, errors };
}
const body = page => page.locator('.send iframe').contentFrame().locator('body');
const settingsBody = page => page.locator('.signature-editor iframe').contentFrame().locator('body');
async function setBody(page, html, settings = false) {
  await page.evaluate(({ html, settings }) => {
    const container = document.querySelector(settings ? '.signature-editor' : '.send');
    const editor = window.tinymce.get(container.querySelector('textarea').id);
    editor.setContent(html);
    editor.dispatch('change');
  }, { html, settings });
}
async function sender(page, name = 'Bob') {
  await page.locator('.sender-select .el-select__wrapper').click();
  await page.getByRole('option', { name: `${name} <${name.toLowerCase()}@example.test>` }).click();
}

test('settings save rich HTML and separate preferences for each mailbox across reloads', async ({ page }) => {
  const { rows, errors } = await setup(page);
  await setBody(page, '<p><strong>Alice edited</strong></p><table><tbody><tr><td><a href="https://example.com">Company</a></td></tr></tbody></table><p><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9l8AAAAASUVORK5CYII=" alt="Logo"></p>', true);
  await page.getByText('Automatically insert in replies and forwards', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Automatically insert in replies and forwards' })).toBeChecked();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => rows[0].html).toContain('Alice edited');
  expect(rows[0].html).toContain('data:image/png;base64');
  expect(rows[0].autoReplyForward).toBe(true);
  await page.locator('.signature-settings .el-select').click();
  await page.getByRole('option', { name: 'bob@example.test', exact: true }).click();
  await expect(settingsBody(page)).toContainText('Bob');
  await expect(page.getByRole('checkbox', { name: 'Automatically insert in new messages' })).not.toBeChecked();
  await page.reload();
  await expect(settingsBody(page)).toContainText('Alice edited');
  expect(errors).toEqual([]);
});

test('new message auto signature, disabled sender, manual insertion and no duplicates', async ({ page }) => {
  const { errors } = await setup(page);
  await page.getByRole('button', { name: 'New message', exact: true }).click();
  await expect(body(page)).toContainText('Alice');
  await expect(body(page).locator('[data-mitco-signature]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Insert signature', exact: true }).click();
  await expect(body(page).locator('[data-mitco-signature]')).toHaveCount(1);
  await sender(page);
  await expect(body(page)).not.toContainText('Alice');
  await expect(body(page)).not.toContainText('Bob');
  await page.getByRole('button', { name: 'Insert signature', exact: true }).click();
  await expect(body(page)).toContainText('Bob');
  expect(errors).toEqual([]);
});

for (const mode of ['Reply message', 'Reply all message', 'Forward message']) {
  test(`${mode}: signature before original message and independent switch`, async ({ page }) => {
    await setup(page);
    await page.getByRole('button', { name: mode, exact: true }).click();
    await expect(body(page)).toContainText('Original message');
    await expect(body(page)).not.toContainText('Alice');
    await sender(page);
    await expect(body(page)).toContainText('Bob');
    await expect(body(page).locator('[data-mitco-quote] [data-mitco-signature]')).toContainText('Original sender signature');
    const text = await body(page).innerText();
    expect(text.indexOf('Bob')).toBeLessThan(text.indexOf('Original message'));
  });
}

test('manual edits require confirmation and cancellation preserves body and signature', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'New message', exact: true }).click();
  await expect(body(page)).toContainText('Alice');
  await setBody(page, '<p>My important message</p><div data-mitco-signature="1"><p>Custom Alice signature</p></div>');
  await sender(page);
  await expect(page.getByText('The existing signature was edited.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Keep edited signature' }).click();
  await expect(body(page)).toContainText('Custom Alice signature');
  await page.getByRole('button', { name: 'Insert signature', exact: true }).click();
  await page.getByRole('button', { name: 'Replace signature', exact: true }).click();
  await expect(body(page)).toContainText('Bob');
  await expect(body(page)).toContainText('My important message');
  await expect(body(page)).not.toContainText('Custom Alice');
});

test('draft restoration preserves saved signature and does not apply newer settings', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    window.signatureTest.draft = { draftId: 1, accountId: 1, sendEmail: 'alice@example.test', name: 'Alice', subject: 'Draft', content: '<p>Draft body</p><div data-mitco-signature="1"><p>Old edited signature</p></div>', signatureSnapshot: '<p>Old signature</p>', receiveEmail: ['outside@example.test'], cc: [], attachments: [], sendType: 'reply' };
  });
  await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
  await expect(body(page)).toContainText('Old edited signature');
  await expect(body(page)).not.toContainText('Alice');
  await expect(body(page).locator('[data-mitco-signature]')).toHaveCount(1);
});

test('closing an untouched signed message does not create a draft prompt', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'New message', exact: true }).click();
  await expect(body(page)).toContainText('Alice');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('.send')).not.toBeVisible();
  await expect(page.locator('.el-message-box')).not.toBeVisible();
  await page.getByRole('button', { name: 'New message', exact: true }).click();
  await expect(body(page).locator('[data-mitco-signature]')).toHaveCount(1);
});

test('unsaved settings are protected when switching accounts or leaving settings', async ({ page }) => {
  await setup(page);
  await setBody(page, '<p>Unsaved Alice</p>', true);
  await page.locator('.signature-settings .el-select').click();
  await page.getByRole('option', { name: 'bob@example.test', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(settingsBody(page)).toContainText('Unsaved Alice');
  await page.getByRole('link', { name: 'Away', exact: true }).click();
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Email signatures' })).not.toBeVisible();
});

test('unsaved signatures survive a theme change and remain protected', async ({ page }) => {
  await setup(page);
  await setBody(page, '<p>Unsaved theme edit</p>', true);
  await page.evaluate(() => { window.signatureTest.useUiStore().dark = true; });
  await expect(settingsBody(page)).toContainText('Unsaved theme edit');
  await page.getByRole('link', { name: 'Away', exact: true }).click();
  await expect(page.getByText('Discard unsaved signature changes?', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('temporary image blobs are embedded before saving', async ({ page }) => {
  const { rows } = await setup(page);
  await page.evaluate(() => {
    const editor = window.tinymce.get(document.querySelector('.signature-editor textarea').id);
    const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9l8AAAAASUVORK5CYII=';
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/png' });
    const info = editor.editorUpload.blobCache.create('pasted-logo', blob, base64);
    editor.editorUpload.blobCache.add(info);
    editor.setContent(`<p>Alice</p><img src="${info.blobUri()}" alt="Pasted logo">`);
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => rows[0].html).toContain('data:image/png;base64');
  expect(rows[0].html).not.toContain('blob:');
});

test('a failed signature save keeps the unsaved text for retry', async ({ page }) => {
  const { rows } = await setup(page);
  await page.route('**/api/account/signature', route => route.fulfill({ json: { code: 500, message: 'Temporary save failure' } }));
  await setBody(page, '<p>Keep my unsaved work</p>', true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Temporary save failure')).toBeVisible();
  await expect(settingsBody(page)).toContainText('Keep my unsaved work');
  expect(rows[0].html).not.toContain('Keep my unsaved work');
});

test('mobile settings and composer fit within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await expect(settingsBody(page)).toContainText('Alice');
  await page.screenshot({ path: '/tmp/mitco-signatures-mobile-settings.png', fullPage: true });
  await page.getByRole('button', { name: 'New message', exact: true }).click();
  await expect(body(page)).toContainText('Alice');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  const box = await page.getByRole('button', { name: 'Send', exact: true }).boundingBox();
  await page.screenshot({ path: '/tmp/mitco-signatures-mobile-compose.png', fullPage: true });
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});

test('sending uses the selected mailbox and the edited signature in the message payload', async ({ page }) => {
  await setup(page);
  let sent;
  await page.route('**/api/email/send', async route => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { code: 200, data: [{ emailId: 92, subject: sent.subject }] } });
  });
  await page.getByRole('button', { name: 'New message', exact: true }).click();
  await sender(page);
  await page.getByRole('button', { name: 'Insert signature', exact: true }).click();
  await setBody(page, '<p>Message to recipient</p><div data-mitco-signature="1"><p>Bob edited signature</p></div>');
  await page.locator('[data-testid="compose-to"]').fill('recipient@example.test');
  await page.locator('[data-testid="compose-to"]').press('Enter');
  await page.getByPlaceholder('Subject', { exact: true }).fill('Signature test');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => sent?.accountId).toBe(2);
  expect(sent.sendEmail).toBe('bob@example.test');
  expect(sent.content).toContain('Bob edited signature');
  expect(sent.text).toContain('Bob edited signature');
});

test('edits typed while a signature save is pending are not overwritten by its response', async ({ page }) => {
  await setup(page);
  let finishSave;
  await page.route('**/api/account/signature', async route => {
    const submitted = route.request().postDataJSON();
    await new Promise(resolve => { finishSave = resolve; });
    await route.fulfill({ json: { code: 200, data: submitted } });
  });
  await setBody(page, '<p>Submitted signature</p>', true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => typeof finishSave).toBe('function');
  await setBody(page, '<p>More recent unsaved edit</p>', true);
  finishSave();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await expect(settingsBody(page)).toContainText('More recent unsaved edit');
  await page.getByRole('link', { name: 'Away', exact: true }).click();
  await expect(page.getByText('Discard unsaved signature changes?', { exact: true })).toBeVisible();
});
