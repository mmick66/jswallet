import { isValidAddress } from '../common/address';
import chain from '../common/chain';

/**
 * Schemas for what the renderer sends over IPC, one per channel in src/main/ipc.js, which
 * src/main/security/ipc.js applies before a handler runs. A schema is a function (value, what) that
 * returns the value, or a copy of it with only the fields it knows, or throws a TypeError that names
 * the argument but never repeats its value, as passwords go through here too.
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

/**
 * No argument at all, for the channels that take none
 */
export const none = (value, what) => {
    if (value !== undefined) throw invalid(what, 'expected none');
    return value;
};

/**
 * An object with the given fields, each checked by its schema and named by its key. The result has
 * only these fields: the handler never sees any other that the renderer sent.
 * @param fields { key: schema }
 */
export const object = (fields) => (value, what) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw invalid(what, 'expected an object');
    return Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema(value[key], key)]));
};

/**
 * A string of 1 to max characters
 */
export const text = (max) => (value, what) => {
    if (typeof value !== 'string') throw invalid(what, 'expected a string');
    if (value.length === 0 || value.length > max) throw invalid(what, `expected 1 to ${max} characters`);
    return value;
};

/**
 * An address on the configured network, see isValidAddress
 */
export const address = (value, what) => {
    text(Limits.Address)(value, what);
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

export const oneOf = (allowed) => (value, what) => {
    if (!allowed.includes(value)) throw invalid(what, `expected one of ${allowed.join(', ')}`);
    return value;
};
