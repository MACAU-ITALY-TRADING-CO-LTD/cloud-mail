import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { checkOversizeMail, formatOversizeNotice, isOversizeEvent } from '../src/service/oversize-mail-alert';

const NOW = new Date('2026-09-25T09:00:00Z');

function createDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE account (account_id INTEGER PRIMARY KEY, email TEXT, user_id INTEGER, is_del INTEGER DEFAULT 0);
    CREATE TABLE email (email_id INTEGER PRIMARY KEY, send_email TEXT, name TEXT, account_id INTEGER, user_id INTEGER,
      subject TEXT, text TEXT, content TEXT, recipient TEXT, to_email TEXT, to_name TEXT, message_id TEXT,
      type INTEGER, status INTEGER, unread INTEGER, is_del INTEGER);`);
  sqlite.exec(readFileSync(new URL('../migrations/20260925_oversize_mail_alert.sql', import.meta.url), 'utf8'));
  sqlite.prepare('INSERT INTO account (account_id, email, user_id) VALUES (1, ?, 1)').run('admin@mitcoasia.com');
  sqlite.prepare('INSERT INTO account (account_id, email, user_id) VALUES (9, ?, 6)').run('samuele@mitcoasia.com');
  return {
    sqlite,
    d1: {
      prepare(sql) {
        const statement = sqlite.prepare(sql);
        return {
          bind(...args) {
            return {
              run: async () => ({ meta: { changes: statement.run(...args).changes } }),
              first: async () => statement.get(...args) ?? null
            };
          }
        };
      },
      async batch(statements) {
        sqlite.exec('BEGIN');
        try {
          const result = [];
          for (const statement of statements) result.push(await statement.run());
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      }
    }
  };
}

function event(overrides = {}) {
  return {
    datetime: '2026-09-25T08:58:00Z',
    sessionId: 'QmR1D9oyK7iP',
    from: 'sender@example.com',
    to: 'Samuele@mitcoasia.com',
    status: 'error',
    errorDetail: 'Email data size exceeded',
    ...overrides
  };
}

function routingResponse(events) {
  return async (_url, request) => {
    const body = JSON.parse(request.body);
    expect(body.variables.filter.status).toBe('error');
    expect(body.variables.filter.errorDetail).toBe('Email data size exceeded');
    return { ok: true, json: async () => ({ data: { viewer: { zones: [{ emailRoutingAdaptive: events }] } } }) };
  };
}

describe('oversized incoming mail alerts', () => {
  let database;
  let env;
  beforeEach(() => {
    database = createDb();
    env = {
      db: database.d1,
      email_routing_analytics_token: 'test-token',
      email_routing_zone_id: 'test-zone',
      oversize_alert_admin: 'admin@mitcoasia.com'
    };
  });
  afterEach(() => database.sqlite.close());

  it('stores one alert in each inbox and deduplicates by Cloudflare session ID', async () => {
    const events = [event(), event({ sessionId: 'old', datetime: '2026-09-25T08:30:00Z' }),
      event({ sessionId: 'other', errorDetail: 'something else' })];
    const first = await checkOversizeMail(env, { now: NOW, fetchImpl: routingResponse(events) });
    const second = await checkOversizeMail(env, { now: NOW, fetchImpl: routingResponse(events) });
    expect(first).toEqual({ newEvents: 1, mailboxCopies: 2 });
    expect(second).toEqual({ newEvents: 0, mailboxCopies: 0 });
    expect(database.sqlite.prepare('SELECT count(*) AS n FROM oversized_mail_alert').get().n).toBe(1);
    const rows = database.sqlite.prepare('SELECT to_email, text, unread, status FROM email ORDER BY to_email').all();
    expect(rows.map(row => row.to_email)).toEqual(['admin@mitcoasia.com', 'samuele@mitcoasia.com']);
    expect(rows.every(row => row.unread === 0 && row.status === 0)).toBe(true);
    expect(rows[0].text).toContain('QmR1D9oyK7iP');
    expect(rows[0].text).toContain('繁體中文');
    expect(rows[0].text).toContain('ITALIANO');
  });

  it('escapes sender data in HTML and rejects unrelated errors', () => {
    const notice = formatOversizeNotice(event({ from: '<bad@example.com>' }));
    expect(notice.html).toContain('&lt;bad@example.com&gt;');
    expect(notice.html).not.toContain('<bad@example.com>');
    expect(isOversizeEvent(event({ status: 'deliveryFailed' }))).toBe(false);
    expect(isOversizeEvent(event({ errorDetail: 'worker script exceeded CPU allocation' }))).toBe(false);
  });

  it('shows UTC, Italian daylight time, and Macao time without Cloudflare branding', () => {
    const notice = formatOversizeNotice(event({ datetime: '2026-09-25T08:27:59Z' }));
    expect(notice.text).toContain('2026-09-25 08:27:59 UTC');
    expect(notice.text).toContain('2026-09-25 10:27:59 (ora italiana, CEST)');
    expect(notice.text).toContain('2026-09-25 16:27:59（澳門時間，UTC+8）');
    expect(notice.text).toContain('MITCO Mail');
    expect(notice.text).not.toContain('Cloudflare');
    const winter = formatOversizeNotice(event({ datetime: '2026-12-25T08:27:59Z' }));
    expect(winter.text).toContain('2026-12-25 09:27:59 (ora italiana, CET)');
    expect(winter.text).toContain('2026-12-25 16:27:59（澳門時間，UTC+8）');
  });

  it('fails before recording an event if the administrator mailbox is unavailable', async () => {
    database.sqlite.exec('DELETE FROM account WHERE account_id = 1');
    await expect(checkOversizeMail(env, { now: NOW, fetchImpl: routingResponse([event()]) })).rejects.toThrow('administrator account is missing');
    expect(database.sqlite.prepare('SELECT count(*) AS n FROM oversized_mail_alert').get().n).toBe(0);
    expect(database.sqlite.prepare('SELECT count(*) AS n FROM email').get().n).toBe(0);
  });
});
