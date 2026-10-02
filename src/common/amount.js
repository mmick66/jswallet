import Constants from './constants';
import { dustLimit } from './fee';

const { Satoshis, Decimals } = Constants.Bitcoin;

const Messages = {
    NotPositive: 'The amount must be more than zero',
    Dust: (limit) => `The amount must be at least Ƀ ${(limit / Satoshis).toFixed(Decimals)}`,
};

// Rounded to whole satoshis, as Wallet.send rounds the amount
export const toSatoshis = (btc) => Math.round(Number(btc) * Satoshis);

/**
 * Why the amount cannot be sent to the receiver, whatever the funds. Below the dust limit of the
 * receiver's output, the output would be non-standard and nodes would not relay the transaction.
 * @param satoshis The amount, rounded to satoshis
 * @param address The receiver, see dustLimit: until it is a valid address, the limit is P2PKH's, the
 * largest of the standard output types, so that it holds for every receiver
 * @returns {string|undefined} The message, or undefined if the amount can be sent
 */
export const amountError = (satoshis, address) => {
    if (!(satoshis > 0)) return Messages.NotPositive;
    const limit = dustLimit(address);
    if (satoshis < limit) return Messages.Dust(limit);
    return undefined;
};
