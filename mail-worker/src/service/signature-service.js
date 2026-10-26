import sanitizeHtml from 'sanitize-html';
import BizError from '../error/biz-error';

export const signatureSchema = `CREATE TABLE IF NOT EXISTS account_signature (
  account_id INTEGER PRIMARY KEY REFERENCES account(account_id) ON DELETE CASCADE,
  html TEXT NOT NULL DEFAULT '',
  auto_new INTEGER NOT NULL DEFAULT 0 CHECK(auto_new IN (0, 1)),
  auto_reply_forward INTEGER NOT NULL DEFAULT 0 CHECK(auto_reply_forward IN (0, 1))
);
`;
export const MAX_SIGNATURE_BYTES = 512 * 1024;

export function cleanSignature(html) {
  if (typeof html !== 'string' || new TextEncoder().encode(html).length > MAX_SIGNATURE_BYTES) {
    throw new BizError('Signature must be HTML under 512 KB.', 400);
  }
  return sanitizeHtml(html, {
    allowedTags: ['div', 'p', 'br', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'img', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'hr'],
    allowedAttributes: {
      '*': ['style'], a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'], table: ['cellpadding', 'cellspacing', 'border']
    },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['https', 'http', 'data'] },
    allowProtocolRelative: false,
    allowedStyles: { '*': {
      'color': [/^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d.,% ]+\))$/i],
      'background-color': [/^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d.,% ]+\))$/i],
      'font-size': [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
      'font-family': [/^[a-z0-9 ,"'-]+$/i],
      'font-weight': [/^(normal|bold|[1-9]00)$/], 'font-style': [/^(normal|italic)$/],
      'text-decoration': [/^(none|underline|line-through)$/], 'text-align': [/^(left|right|center|justify)$/],
      'width': [/^\d+(\.\d+)?(px|pt|em|%)$/], 'height': [/^\d+(\.\d+)?(px|pt|em|%)$/],
      'padding': [/^[\d.]+(px|pt|em)( [\d.]+(px|pt|em)){0,3}$/],
      'border-collapse': [/^(collapse|separate)$/], 'vertical-align': [/^(top|middle|bottom|baseline)$/]
    } },
    exclusiveFilter: frame => frame.tag === 'img' && (!frame.attribs.src || !/^(https?:\/\/|data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$)/i.test(frame.attribs.src)),
    transformTags: { a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, rel: 'noopener noreferrer' } }) }
  });
}

function accountIdOf(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new BizError('Invalid mailbox.', 400);
  return id;
}

const signatureService = {
  async list(c, userId) {
    const { results } = await c.env.db.prepare(`
      SELECT a.account_id AS accountId, a.email, a.name,
        COALESCE(s.html, '') AS html, COALESCE(s.auto_new, 0) AS autoNew,
        COALESCE(s.auto_reply_forward, 0) AS autoReplyForward
      FROM account a LEFT JOIN account_signature s ON s.account_id = a.account_id
      WHERE a.user_id = ? AND a.is_del = 0 ORDER BY a.sort DESC, a.account_id
    `).bind(userId).all();
    return results.map(row => ({ ...row, autoNew: !!row.autoNew, autoReplyForward: !!row.autoReplyForward }));
  },
  async save(c, params, userId) {
    const accountId = accountIdOf(params.accountId);
    if (typeof params.autoNew !== 'boolean' || typeof params.autoReplyForward !== 'boolean') {
      throw new BizError('Invalid signature preferences.', 400);
    }
    const html = cleanSignature(params.html);
    // Ownership and deletion are checked in the write itself, including concurrent deletion.
    const row = await c.env.db.prepare(`
      INSERT INTO account_signature (account_id, html, auto_new, auto_reply_forward)
      SELECT account_id, ?, ?, ? FROM account WHERE account_id = ? AND user_id = ? AND is_del = 0
      ON CONFLICT(account_id) DO UPDATE SET html = excluded.html,
        auto_new = excluded.auto_new, auto_reply_forward = excluded.auto_reply_forward
      RETURNING account_id AS accountId, html, auto_new AS autoNew, auto_reply_forward AS autoReplyForward
    `).bind(html, Number(params.autoNew), Number(params.autoReplyForward), accountId, userId).first();
    if (!row) throw new BizError('Mailbox not found.', 404);
    return { ...row, autoNew: !!row.autoNew, autoReplyForward: !!row.autoReplyForward };
  }
};
export default signatureService;
