import bitcoin from './bitcoin';
import bnet from './network';

/**
 * Whether bitcoins can be sent to the address on the configured network.
 * Checks the Base58Check or bech32/bech32m checksum, the network and the script type.
 * @param address As entered by the user
 * @returns {boolean}
 */
// eslint-disable-next-line import-x/prefer-default-export -- callers and tests import { isValidAddress } by name
export const isValidAddress = (address) => {
    if (typeof address !== 'string') return false;
    try {
        bitcoin.address.toOutputScript(address, bnet.current);
        return true;
    } catch (e) {
        return false;
    }
};
