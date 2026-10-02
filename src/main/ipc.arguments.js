import { isValidAddress } from '../common/address';
import chain from '../common/chain';

/**
 * Checks for what the renderer sends over IPC. Each returns the value it was given, or throws a
 * TypeError that names the argument but never repeats its value, as passwords go through here too.
 */

export const Limits = {
    Name: 100,
    Password: 1024,
    Address: 100, // bech32 addresses have at most 90 characters
    Addresses: 100,
    Amount: 32,
    Text: 1000,
};

const invalid = (what, why) => new TypeError(`Invalid ${what}: ${why}`);

export const object = (value, what) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid(what, 'expected an object');
    return value;
};

export const text = (value, what, max) => {
    if (typeof value !== 'string') throw invalid(what, 'expected a string');
    if (value.length === 0 || value.length > max) throw invalid(what, `expected 1 to ${max} characters`);
    return value;
};

/**
 * An address on the configured network, see isValidAddress
 */
export const address = (value, what) => {
    text(value, what, Limits.Address);
    if (!isValidAddress(value)) throw invalid(what, `not a ${chain.name} address`);
    return value;
};

export const addresses = (value, what) => {
    if (!Array.isArray(value)) throw invalid(what, 'expected an array');
    if (value.length > Limits.Addresses) throw invalid(what, `expected at most ${Limits.Addresses} addresses`);
    value.forEach((a, i) => address(a, `${what}[${i}]`));
    return value;
};

/**
 * A non-negative number of bitcoins, as a number or as the decimal text of the send form.
 * Wallet.send checks the range and the precision.
 */
export const bitcoins = (value, what) => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
    if (typeof value === 'string' && value.length <= Limits.Amount && /^[0-9]+(\.[0-9]*)?$/.test(value)) return value;
    throw invalid(what, 'expected an amount in bitcoins');
};

export const oneOf = (value, what, allowed) => {
    if (!allowed.includes(value)) throw invalid(what, `expected one of ${allowed.join(', ')}`);
    return value;
};
