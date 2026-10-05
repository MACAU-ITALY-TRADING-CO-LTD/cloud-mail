// Upload limits can reject the request before MITCO Mail's API returns JSON.
export function isOversizedSendError(error) {
    if ([error?.response?.status, error?.status, error?.code].some(value => Number(value) === 413)) {
        return true;
    }

    const messages = [error?.message, error?.response?.data?.message];
    return messages.some(message => typeof message === 'string'
        && /\b(?:payload too large|request entity too large|email size exceeds|message size exceeds|status code 413)\b/i.test(message));
}
