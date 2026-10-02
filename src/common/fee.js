import Constants from './constants';

const { Vbytes, DustLimit } = Constants.Transactions;

/**
 * The size in vbytes of a transaction that spends the wallet's P2PKH outputs, at most.
 * Every output counts as P2PKH: a P2WPKH receiver is 3 vbytes smaller, a P2TR or P2WSH one 9 bigger.
 */
export const vbytes = (inputs, outputs) => Vbytes.Overhead + inputs * Vbytes.Input + outputs * Vbytes.Output;

// Rounded up, so that the transaction pays at least the rate
const feeFor = (rate, inputs, outputs) => Math.ceil(rate * vbytes(inputs, outputs));

/**
 * Picks the unspent outputs, in order, until they cover the amount and the fee for the inputs picked
 * so far and two outputs: the receiver and the change. Change below the dust limit is left to the fee,
 * and then the fee for one output is enough. Wallet.send spends what this picks.
 * @param values The unspent outputs' values in satoshis, in the order they are spent
 * @param amount The satoshis to send
 * @param rate The fee rate in sat/vB
 * @returns {{covered: boolean, inputs: number, fee: number, change: number}} In satoshis. If the
 * outputs do not cover the amount, covered is false and the fee is the one for spending them all.
 */
export const planSpend = (values, amount, rate) => {
    let total = 0;
    for (let inputs = 1; inputs <= values.length; inputs += 1) {
        total += values[inputs - 1];
        const fee = feeFor(rate, inputs, 2);
        const change = total - amount - fee;
        if (change >= DustLimit) {
            return {
                covered: true, inputs, fee, change
            };
        }
        if (total - amount >= feeFor(rate, inputs, 1)) {
            return {
                covered: true, inputs, fee: total - amount, change: 0
            };
        }
    }
    return {
        covered: false, inputs: values.length, fee: feeFor(rate, values.length, 1), change: 0
    };
};
