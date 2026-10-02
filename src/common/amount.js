import Constants from './constants';

const { Satoshis, Decimals } = Constants.Bitcoin;
const { DustLimit } = Constants.Transactions;

const Messages = {
    NotPositive: 'The amount must be more than zero',
    Dust: `The amount must be at least Ƀ ${(DustLimit / Satoshis).toFixed(Decimals)}`,
};

// Rounded to whole satoshis, as Wallet.send rounds the amount
export const toSatoshis = (btc) => Math.round(Number(btc) * Satoshis);

/**
 * Why the amount cannot be sent, whatever the funds. Below the dust limit the receiver's output
 * would be non-standard and nodes would not relay the transaction. The limit is P2PKH's, the
 * largest of the standard output types, so it holds for every receiver.
 * @param satoshis The amount, rounded to satoshis
 * @returns {string|undefined} The message, or undefined if the amount can be sent
 */
export const amountError = (satoshis) => {
    if (!(satoshis > 0)) return Messages.NotPositive;
    if (satoshis < DustLimit) return Messages.Dust;
    return undefined;
};
