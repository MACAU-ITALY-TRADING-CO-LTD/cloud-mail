// Signatures are editable, top-level blocks. Quoted messages are never rewritten.
export function signatureEnabled(signature, mode) {
  return !!signature?.html && !!(mode === 'reply' || mode === 'forward'
    ? signature.autoReplyForward : signature.autoNew);
}

export function updateSignature(content, signature, mode, options = {}) {
  const root = document.createElement('div');
  root.innerHTML = content || '<div><br></div>';
  const blocks = [...root.children].filter(el => el.getAttribute('data-mitco-signature') === '1');
  const block = blocks[0];
  const snapshot = options.snapshot || '';
  if (!options.force && snapshot && !block) return { html: root.innerHTML, snapshot }; // User removed it.
  if (block && snapshot && block.innerHTML !== snapshot && !options.replaceEdited) {
    return { html: root.innerHTML, snapshot, edited: true };
  }
  blocks.forEach(el => el.remove());
  if (!(options.force ? signature?.html : signatureEnabled(signature, mode))) {
    return { html: root.innerHTML, snapshot: '' };
  }
  const next = document.createElement('div');
  next.setAttribute('data-mitco-signature', '1');
  next.innerHTML = signature.html;
  // Place after the user's text and before the original message.
  const quote = [...root.children].find(el => el.getAttribute('data-mitco-quote') === '1' || el.tagName === 'BLOCKQUOTE');
  root.insertBefore(next, quote || null);
  return { html: root.innerHTML, snapshot: next.innerHTML };
}

export function signatureSnapshot(content) {
  const root = document.createElement('div');
  root.innerHTML = content || '';
  return [...root.children].find(el => el.getAttribute('data-mitco-signature') === '1')?.innerHTML || '';
}
