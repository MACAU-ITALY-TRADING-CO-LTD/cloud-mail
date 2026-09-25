const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';
const QUERY_LIMIT = 1000;
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const INITIAL_LOOKBACK_MS = 15 * 60 * 1000;
const ERROR_DETAIL = 'Email data size exceeded';
const START_KEY = 'oversize_alert_start_at';

const QUERY = `query EmailRoutingActivity($zoneTag: string, $filter: EmailRoutingAdaptiveFilter_InputObject) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      emailRoutingAdaptive(filter: $filter, limit: 1000, orderBy: [datetime_DESC]) {
        datetime
        sessionId
        from
        to
        status
        errorDetail
      }
    }
  }
}`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function localDateTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day} ${fields.hour}:${fields.minute}:${fields.second}`;
}

function italyZoneName(date) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', timeZoneName: 'short' })
    .formatToParts(date).find(part => part.type === 'timeZoneName').value;
}

export function isOversizeEvent(event) {
  return event?.status === 'error'
    && typeof event.errorDetail === 'string'
    && event.errorDetail.includes(ERROR_DETAIL)
    && typeof event.sessionId === 'string'
    && event.sessionId.length > 0
    && typeof event.to === 'string'
    && event.to.trim().length > 0
    && typeof event.from === 'string'
    && event.from.trim().length > 0
    && Number.isFinite(Date.parse(event.datetime));
}

export function formatOversizeNotice(event) {
  const sender = event.from.trim();
  const recipient = event.to.trim().toLowerCase();
  const date = new Date(event.datetime);
  const utcTime = `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  const italyTime = `${localDateTime(date, 'Europe/Rome')} (ora italiana, ${italyZoneName(date)})`;
  const macauTime = `${localDateTime(date, 'Asia/Macau')}（澳門時間，UTC+8）`;
  const id = event.sessionId;
  const subject = 'Undelivered email: over 25 MiB / Email non recapitata / 電郵過大未送達';
  const text = [
    'ENGLISH',
    `An email from ${sender} to ${recipient} was rejected on ${utcTime} because its total size, including attachments, exceeded MITCO Mail's 25 MiB incoming email limit. The email and attachments did not reach your inbox. Other email services also have size limits; this is not a problem with your individual mailbox. Please ask the sender to send smaller files or share a download link.`,
    '',
    'ITALIANO',
    `Un'email da ${sender} a ${recipient} è stata rifiutata il ${italyTime} perché le dimensioni totali, allegati inclusi, superavano il limite di 25 MiB per le email in arrivo di MITCO Mail. Il messaggio e gli allegati non sono arrivati nella casella di posta. Anche altri servizi email hanno limiti di dimensione: non è un problema della tua casella personale. Chiedi al mittente di inviare file più piccoli o un link per scaricarli.`,
    '',
    '繁體中文（澳門）',
    `${sender} 寄給 ${recipient} 的電郵於 ${macauTime}遭拒收，原因是電郵連附件的總大小超過 MITCO Mail 的 25 MiB 收件上限。該電郵及附件沒有進入你的收件匣。其他電郵服務亦有大小上限，這並非你的個人郵箱故障。請發件人縮小檔案，或改以下載連結分享。`,
    '',
    `MITCO Mail event ID / ID evento / 事件編號：${id}`,
    'The original email content and exact size are unavailable because it was rejected before delivery.',
    'Il contenuto originale e la dimensione esatta non sono disponibili perché il messaggio è stato rifiutato prima della consegna.',
    '由於郵件在投遞前已遭拒收，我們無法查看原文或確切大小。'
  ].join('\n');
  return { subject, text, html: `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</div>` };
}

export async function fetchRoutingEvents(token, zoneId, now = new Date(), fetchImpl = fetch) {
  const response = await fetchImpl(GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        zoneTag: zoneId,
        filter: {
          datetime_geq: new Date(now.getTime() - LOOKBACK_MS).toISOString(),
          datetime_leq: now.toISOString(),
          status: 'error',
          errorDetail: ERROR_DETAIL
        }
      }
    })
  });
  if (!response.ok) throw new Error(`Email Routing analytics HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(`Email Routing analytics: ${payload.errors.map(e => e.message).join('; ')}`);
  const events = payload.data?.viewer?.zones?.[0]?.emailRoutingAdaptive;
  if (!Array.isArray(events)) throw new Error('Email Routing analytics returned no zone events');
  if (events.length >= QUERY_LIMIT) throw new Error('Email Routing analytics query was truncated at 1000 events');
  return events;
}

async function getStartAt(db, now) {
  const initial = new Date(now.getTime() - INITIAL_LOOKBACK_MS).toISOString();
  await db.prepare('INSERT OR IGNORE INTO mail_monitor_state (key, value) VALUES (?, ?)')
    .bind(START_KEY, initial).run();
  const row = await db.prepare('SELECT value FROM mail_monitor_state WHERE key = ?')
    .bind(START_KEY).first();
  if (!row || !Number.isFinite(Date.parse(row.value))) throw new Error('Missing oversized mail monitor start time');
  return Date.parse(row.value);
}

async function saveAlert(db, event, admin) {
  const recipient = event.to.trim().toLowerCase();
  const addresses = [...new Set([recipient, admin.toLowerCase()])];
  const adminAccount = await db.prepare('SELECT account_id FROM account WHERE lower(email) = ? AND is_del = 0 LIMIT 1')
    .bind(admin.toLowerCase()).first();
  if (!adminAccount) throw new Error('Oversized mail alert administrator account is missing');

  const notice = formatOversizeNotice(event);
  const insertEmail = `INSERT INTO email
    (send_email, name, account_id, user_id, subject, text, content, recipient, to_email,
     to_name, message_id, type, status, unread, is_del)
    SELECT ?, 'MITCO Mail Delivery Alert', account_id, user_id, ?, ?, ?, ?, lower(email),
           '', ?, 0, 0, 0, 0
    FROM account
    WHERE lower(email) = ? AND is_del = 0
      AND NOT EXISTS (SELECT 1 FROM oversized_mail_alert WHERE session_id = ?)`;
  const statements = addresses.map(address => db.prepare(insertEmail).bind(
    admin.toLowerCase(), notice.subject, notice.text, notice.html,
    JSON.stringify([{ address, name: '' }]), `<oversize-${event.sessionId}@mitcoasia.com>`,
    address, event.sessionId
  ));
  statements.push(db.prepare(`INSERT OR IGNORE INTO oversized_mail_alert
    (session_id, occurred_at, sender, recipient) VALUES (?, ?, ?, ?)`)
    .bind(event.sessionId, event.datetime, event.from.trim(), recipient));
  const result = await db.batch(statements);
  return { newEvent: result.at(-1).meta.changes === 1, mailboxCopies: result.slice(0, -1).reduce((sum, row) => sum + row.meta.changes, 0) };
}

export async function checkOversizeMail(env, { now = new Date(), fetchImpl = fetch } = {}) {
  if (!env.email_routing_analytics_token || !env.email_routing_zone_id) {
    throw new Error('Oversized mail monitor needs an analytics token and zone ID');
  }
  const admin = env.oversize_alert_admin || 'admin@mitcoasia.com';
  const startAt = await getStartAt(env.db, now);
  const events = await fetchRoutingEvents(env.email_routing_analytics_token, env.email_routing_zone_id, now, fetchImpl);
  let newEvents = 0;
  let mailboxCopies = 0;
  for (const event of events.filter(isOversizeEvent).reverse()) {
    if (Date.parse(event.datetime) < startAt) continue;
    const result = await saveAlert(env.db, event, admin);
    if (result.newEvent) newEvents++;
    mailboxCopies += result.mailboxCopies;
  }
  return { newEvents, mailboxCopies };
}
