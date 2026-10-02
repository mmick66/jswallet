import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from '@bitcoinerlab/secp256k1';
import { BIP32Factory } from 'bip32';
import { ECPairFactory } from 'ecpair';

/**
 * bitcoinjs-lib, bip32 and ecpair with their secp256k1 backend wired in.
 * @bitcoinerlab/secp256k1 is pure JS (noble-curves), so the builds need no WASM support.
 * Import bitcoinjs-lib through this module: taproot (bech32m) addresses need the ECC library.
 */

bitcoin.initEccLib(ecc);

export const bip32 = BIP32Factory(ecc);

export const ECPair = ECPairFactory(ecc);

export default bitcoin;
