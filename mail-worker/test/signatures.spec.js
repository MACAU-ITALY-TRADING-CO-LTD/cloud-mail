import { beforeEach, describe, expect, it } from 'vitest';
import { parseHTML } from 'linkedom';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import signatureService, { cleanSignature, signatureSchema } from '../src/service/signature-service';
import { signatureEnabled, updateSignature, signatureSnapshot } from '../../mail-vue/src/utils/signatures';

beforeEach(() => { globalThis.document = parseHTML('<html><body></body></html>').document; });
const alice = { html: '<p><strong>Alice</strong> — MITCO</p>', autoNew: true, autoReplyForward: false };
const bob = { html: '<p>Bob</p>', autoNew: false, autoReplyForward: true };

describe('per-mailbox signature composition', () => {
  it('respects all four combinations of the independent preferences', () => {
    for (const autoNew of [false, true]) for (const autoReplyForward of [false, true]) {
      const signature = { ...alice, autoNew, autoReplyForward };
      expect(signatureEnabled(signature, '')).toBe(autoNew);
      expect(signatureEnabled(signature, 'reply')).toBe(autoReplyForward);
      expect(signatureEnabled(signature, 'forward')).toBe(autoReplyForward);
    }
  });
  it('adds a formatted signature once, after body and before original reply/forward', () => {
    for (const mode of ['reply', 'forward']) {
      const initial = '<div>My response</div><div data-mitco-quote="1"><div data-mitco-signature="1">Original sender</div></div>';
      const first = updateSignature(initial, bob, mode);
      const second = updateSignature(first.html, bob, mode, { snapshot: first.snapshot });
      expect(second.html).toBe(first.html);
      expect(second.html.indexOf('My response')).toBeLessThan(second.html.indexOf('Bob'));
      expect(second.html.indexOf('Bob')).toBeLessThan(second.html.indexOf('Original sender'));
      expect(second.html.match(/data-mitco-signature/g)).toHaveLength(2);
    }
  });
  it('replaces only the managed signature on mailbox change, or removes it if disabled', () => {
    const first = updateSignature('<p>Keep my body</p>', alice, '');
    const next = updateSignature(first.html, { ...bob, autoNew: true }, '', { snapshot: first.snapshot });
    expect(next.html).toContain('Keep my body');
    expect(next.html).toContain('Bob'); expect(next.html).not.toContain('Alice');
    const off = updateSignature(next.html, bob, '', { snapshot: next.snapshot });
    expect(off.html).toBe('<p>Keep my body</p>');
  });
  it('preserves edited signatures unless replacement is explicitly confirmed', () => {
    const first = updateSignature('<p>Hello</p>', alice, '');
    const edited = first.html.replace('Alice', 'Edited Alice');
    expect(updateSignature(edited, bob, '', { snapshot: first.snapshot }).edited).toBe(true);
    const replaced = updateSignature(edited, bob, '', { snapshot: first.snapshot, replaceEdited: true, force: true });
    expect(replaced.html).not.toContain('Alice'); expect(replaced.html).toContain('Bob');
  });
  it('respects manual deletion until the user explicitly inserts again', () => {
    const removed = updateSignature('<p>Hello</p>', alice, '', { snapshot: alice.html });
    expect(removed.html).toBe('<p>Hello</p>');
    expect(updateSignature(removed.html, alice, '', { snapshot: alice.html, force: true }).html).toContain('Alice');
  });
  it('ignores nested signature blocks in received mail', () => {
    expect(signatureSnapshot('<blockquote><div data-mitco-signature="1">Someone else</div></blockquote>')).toBe('');
  });
});

describe('signature HTML validation', () => {
  it('preserves rich formatting, tables, safe links and embedded raster images', () => {
    const safe = '<table><tbody><tr><td><strong>Alice</strong><span style="color: #123456; font-size: 14px">MITCO</span><a href="https://example.com">Website</a><img src="data:image/png;base64,aGVsbG8=" alt="Logo"></td></tr></tbody></table>';
    const html = cleanSignature(safe);
    expect(html).toContain('<table>'); expect(html).toContain('<strong>Alice</strong>');
    expect(html).toContain('color:#123456'); expect(html).toContain('data:image/png;base64,aGVsbG8=');
    expect(html).toContain('href="https://example.com"');
  });
  it('rejects active content, dangerous protocols, SVG, external styles and signature markers', () => {
    const html = cleanSignature('<script>alert(1)</script><iframe src="https://evil.test"></iframe><svg onload="alert(1)"></svg><div data-mitco-signature="1" onclick="alert(1)" style="background:url(https://evil.test); position:fixed"><a href="javascript:alert(1)">link</a><img src="data:image/svg+xml;base64,AAAA"><img src="blob:test"><img src="/private"></div>');
    expect(html).not.toMatch(/script|iframe|svg|onclick|data-mitco|javascript|blob:|background|position|<img/);
  });
  it('enforces type and UTF-8 byte limits', () => {
    expect(() => cleanSignature({})).toThrow();
    expect(() => cleanSignature('漢'.repeat(180000))).toThrow('512 KB');
  });
});

// Real SQLite executes the same parameterized SQL as D1; no mocked authorization checks.
describe('signature persistence and ownership', () => {
  it('round-trips settings across mailboxes, denies foreign/deleted accounts and migrates idempotently', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mitco-signatures-'));
    const file = join(dir, 'db.sqlite');
    function run(sql, args = [], all = false) {
      return JSON.parse(execFileSync('python3', ['-c', `import sqlite3,json,sys\ndb=sqlite3.connect(sys.argv[1])\ndb.row_factory=sqlite3.Row\np=json.loads(sys.stdin.read())\nc=db.execute(p['sql'],p['args'])\nrows=[dict(r) for r in c.fetchall()]\ndb.commit()\nprint(json.dumps(rows if p['all'] else (rows[0] if rows else None)))`, file], { input: JSON.stringify({ sql, args, all }), encoding: 'utf8' }));
    }
    const c = { env: { db: { prepare: sql => ({ bind: (...args) => ({ first: async () => run(sql, args), all: async () => ({ results: run(sql, args, true) }) }) }) } } };
    try {
      run('CREATE TABLE account (account_id INTEGER PRIMARY KEY, user_id INTEGER, email TEXT, name TEXT, is_del INTEGER DEFAULT 0, sort INTEGER DEFAULT 0)');
      run("INSERT INTO account(account_id,user_id,email,name,is_del) VALUES (1,10,'a@example.test','A',0),(2,10,'b@example.test','B',0),(3,20,'c@example.test','C',0),(4,10,'deleted@example.test','D',1)");
      run(signatureSchema); run(signatureSchema);
      expect(await signatureService.list(c, 10)).toEqual([
        { accountId: 1, email: 'a@example.test', name: 'A', html: '', autoNew: false, autoReplyForward: false },
        { accountId: 2, email: 'b@example.test', name: 'B', html: '', autoNew: false, autoReplyForward: false }
      ]);
      await signatureService.save(c, { accountId: 1, ...alice }, 10);
      await signatureService.save(c, { accountId: 2, ...bob }, 10);
      let rows = await signatureService.list(c, 10);
      expect(rows[0]).toMatchObject(alice); expect(rows[1]).toMatchObject(bob);
      await expect(signatureService.save(c, { accountId: 3, ...alice }, 10)).rejects.toMatchObject({ code: 404 });
      await expect(signatureService.save(c, { accountId: 4, ...alice }, 10)).rejects.toMatchObject({ code: 404 });
      await expect(signatureService.save(c, { accountId: '1 OR 1=1', ...alice }, 10)).rejects.toMatchObject({ code: 400 });
      await expect(signatureService.save(c, { accountId: 1, ...alice, autoNew: 'false' }, 10)).rejects.toMatchObject({ code: 400 });
      await signatureService.save(c, { accountId: 1, html: '', autoNew: false, autoReplyForward: true }, 10);
      rows = await signatureService.list(c, 10);
      expect(rows[0].html).toBe(''); expect(rows[1]).toMatchObject(bob);
      expect((await signatureService.list(c, 20))[0].html).toBe('');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
