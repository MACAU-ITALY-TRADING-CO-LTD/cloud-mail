import BizError from '../error/biz-error';
import verifyUtils from './verify-utils';
import { t } from '../i18n/i18n';

export function normalizeRecipients(to, cc = []) {
  const seen = new Set();
  const normalize = list => {
    if (!Array.isArray(list)) throw new BizError(t('notEmail'));
    return list.map(value => {
      if (typeof value !== 'string' || /[\r\n]/.test(value) || !verifyUtils.isEmail(value.trim())) {
        throw new BizError(t('notEmail'));
      }
      return value.trim();
    }).filter(address => {
      const key = address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const result = { to: normalize(to), cc: normalize(cc) };
  if (!result.to.length) throw new BizError(t('notEmail'));
  return result;
}
