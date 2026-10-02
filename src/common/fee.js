import Constants from './constants';
import bitcoin from './bitcoin';
import chain from './chain';

const { Vbytes, Dust, DustLimit } = Constants.Transactions;
const { opcodes } = bitcoin;

// The script that pays the address, or undefined if it is not a valid address on the configured network
const outputScript = (address) => {
    try {
        return bitcoin.address.toOutputScript(address, chain.current);
    } catch (e) {
        return undefined;
    }
};

// Its 8-byte value, the script's length in one byte, and the script
const scriptOutputVbytes = (script) => 9 + script.length;

/**
 * The size in vbytes of the output that pays the address: its 8-byte value, the script's length in
 * one byte, and the script. P2WPKH is 31 vbytes, P2SH 32, P2PKH 34, P2TR and P2WSH 43.
 * @param address The receiver, on the configured network
 * @returns {number} Vbytes.LargestOutput if it is not a valid address, as before one is entered, so
 * that the fee is not too low for the usual receivers
 */
export const outputVbytes = (address) => {
    const script = outputScript(address);
    return script ? scriptOutputVbytes(script) : Vbytes.LargestOutput;
};

// As Bitcoin Core tells a witness program: a version, OP_0 to OP_16, and a push of the other 2 to 40 bytes
const isWitnessProgram = (script) => script.length >= 4 && script.length <= 42
    && (script[0] === opcodes.OP_0 || (script[0] >= opcodes.OP_1 && script[0] <= opcodes.OP_16))
    && script[1] + 2 === script.length;

/**
 * The smallest amount that the output paying the address can hold for nodes to relay the transaction,
 * as Bitcoin Core counts it: 3 sat/vB for the output and an input that spends it, which is smaller for
 * a witness program. So it depends on the type, not only on the size: P2WPKH (31 vbytes) is 294
 * satoshis, P2SH (32 vbytes) 540, P2PKH 546, P2TR and P2WSH 330.
 * @param address The receiver, on the configured network
 * @returns {number} In satoshis; DustLimit, P2PKH's and the largest of the standard types, if it is
 * not a valid address, as before one is entered, so that it holds for every receiver
 */
export const dustLimit = (address) => {
    const script = outputScript(address);
    if (!script) return DustLimit;
    const spend = isWitnessProgram(script) ? Dust.WitnessSpend : Dust.Spend;
    return Dust.Rate * (scriptOutputVbytes(script) + spend);
};

/**
 * The size in vbytes of a transaction that spends the wallet's P2PKH outputs, at most: each input
 * counts a signature of 72 bytes, and most have 71.
 * @param inputs The number of inputs
 * @param outputs The size in vbytes of each output
 */
export const vbytes = (inputs, outputs) => Vbytes.Overhead + inputs * Vbytes.Input + outputs.reduce((sum, size) => sum + size, 0);

// Rounded up, so that the transaction pays at least the rate
const feeFor = (rate, inputs, outputs) => Math.ceil(rate * vbytes(inputs, outputs));

/**
 * Picks the unspent outputs, in order, until they cover the amount and the fee for the inputs picked
 * so far and two outputs: the receiver's and the change, which pays this wallet's P2PKH address.
 * Change below the dust limit is left to the fee, and then the fee for the receiver's output alone is
 * enough. Wallet.send spends what this picks.
 * @param values The unspent outputs' values in satoshis, in the order they are spent
 * @param amount The satoshis to send
 * @param rate The fee rate in sat/vB
 * @param receiver The size in vbytes of the receiver's output, see outputVbytes
 * @returns {{covered: boolean, inputs: number, fee: number, change: number}} In satoshis. If the
 * outputs do not cover the amount, covered is false and the fee is the one for spending them all.
 */
export const planSpend = (values, amount, rate, receiver) => {
    const withChange = [receiver, Vbytes.Change];
    const withoutChange = [receiver];
    let total = 0;
    for (let inputs = 1; inputs <= values.length; inputs += 1) {
        total += values[inputs - 1];
        const fee = feeFor(rate, inputs, withChange);
        const change = total - amount - fee;
        if (change >= DustLimit) {
            return {
                covered: true, inputs, fee, change
            };
        }
        if (total - amount >= feeFor(rate, inputs, withoutChange)) {
            return {
                covered: true, inputs, fee: total - amount, change: 0
            };
        }
    }
    return {
        covered: false, inputs: values.length, fee: feeFor(rate, values.length, withoutChange), change: 0
    };
};
