// Historical messages store PostalMime address lists as JSON strings.
export function parseAddresses(value) {
  try {
    const list = typeof value === 'string' ? JSON.parse(value || '[]') : value;
    if (!Array.isArray(list)) return [];
    return list.flatMap(item => item?.group ? parseAddresses(item.group) : [item])
      .filter(item => item && typeof item.address === 'string' && item.address.trim())
      .map(item => ({ address: item.address.trim(), name: item.name || '' }));
  } catch {
    return [];
  }
}

export function replyRecipients(email, ownAddresses = [], replyAll = false) {
  if (!replyAll) return { to: [email.sendEmail].filter(Boolean), cc: [] };
  const seen = new Set(ownAddresses.filter(Boolean).map(address => address.trim().toLowerCase()));
  const unique = addresses => addresses.filter(address => {
    const key = address.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    to: unique([email.sendEmail, ...parseAddresses(email.recipient).map(item => item.address)].filter(Boolean)),
    cc: unique(parseAddresses(email.cc).map(item => item.address)),
  };
}
