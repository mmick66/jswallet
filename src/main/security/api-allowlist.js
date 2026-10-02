/**
 * The hosts that the main process may call: mempool.space (Esplora, fees and prices) and
 * api.blockchain.info (price charts). The API sends address lookups and signed transactions, so
 * a typo or an edited env.json must not send them over plain HTTP or to another host.
 * src/main/network.js checks its configured URLs and each request with checkApiUrl.
 */
export const AllowedHosts = ['mempool.space', 'api.blockchain.info'];

/**
 * Throws unless url is an https: URL on one of AllowedHosts, at the default port: a host with
 * another port is another host. Subdomains and look-alikes (mempool.space.example) are other hosts.
 * @param url An absolute URL, as a string
 */
export const checkApiUrl = (url) => {
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`${url} is not a URL`);
    }
    if (parsed.protocol !== 'https:') throw new Error(`${url} does not use https:`);
    if (!AllowedHosts.includes(parsed.host)) {
        throw new Error(`${url} is not on an allowed host (${AllowedHosts.join(', ')})`);
    }
};
