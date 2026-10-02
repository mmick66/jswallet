import jswallet from './jswallet';

/**
 * Copies text with the W3C clipboard API, which works in a focused window.
 * If that is blocked, the main process writes it to the clipboard.
 * @returns {Promise<void>}
 */
const copyText = (text) => Promise.resolve()
    .then(() => navigator.clipboard.writeText(text))
    .catch(() => jswallet.writeClipboard(text));

export default copyText;
