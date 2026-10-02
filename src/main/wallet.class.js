import { generateMnemonic, mnemonicToSeedSync } from 'bip39';

import Constants from '../common/constants';
import cipher from './cipher';
import bitcoin, { bip32, ECPair } from '../common/bitcoin';
import { isValidAddress } from '../common/address';
import { outputVbytes, planSpend } from '../common/fee';
import { amountError } from '../common/amount';

import bnet from './network';
import Database from './database';

/**
 * @param btc Bitcoins, as a number or a numeric string
 * @param what Names the value in the error
 * @returns {bigint} Satoshis
 */
const toSatoshis = (btc, what) => {
    const given = typeof btc === 'number' || (typeof btc === 'string' && btc.trim() !== '');
    const satoshis = given ? Math.round(Number(btc) * Constants.Bitcoin.Satoshis) : NaN;
    if (!Number.isSafeInteger(satoshis) || satoshis < 0) throw new Error(`Not a valid ${what} in bitcoins: ${btc}`);
    return BigInt(satoshis);
};

const verifySignature = (pubkey, hash, signature) => ECPair.fromPublicKey(pubkey).verify(hash, signature);

class Wallet {

    constructor(info) {
        this.__name = info.name;
        this.__address = info.address;
        this.__wif = info.wif;
        this.__network = info.network;

        this.__password = info.password || undefined;

        this.__utxos = [];

    }

    /**
     * This will set the unspend outputs as retrieved by the network.
     * It will also parse them to retrieve the total number of coins available to the wallet
     * @param value
     */
    set utxos(value) {
        this.__utxos = value;
    }

    get utxos() {
        return this.__utxos;
    }

    /**
     * Coins are not set explicitly but through the unspent outputs
     * @returns {number|*}
     */
    get coins() {
        return this.utxos.reduce((a, c) => a + c.value, 0) / Constants.Bitcoin.Satoshis;
    }

    get name() {
        return this.__name;
    }

    get address() {
        return this.__address;
    }

    get key() {
        return this.address;
    }

    get wif() {
        return this.__wif;
    }

    get network() {
        return this.__network;
    }

    /**
     * This is irreversible as there is not way to decrypt the wallet for good.
     * The only way to read the key is with the readDecrypted function
     * @param password Cleartext or hashed makes no difference
     * @returns {Wallet} It returns itself
     * @code const wallet = Wallet.create(name, mnemonic).encrypt(password);
     */
    encrypt(password) {
        if (this.__password) throw new Error('Cannot re-encrypt an encrypted key');
        this.__password = password;
        this.__wif = cipher.encrypt(this.__wif, password);
        return this;
    }

    /**
     * This method will NOT decrypt the wallet but temporarily the key and return it to the calling code
     * This method is NOT symmetrical with the encrypt one.
     * A key stored in the legacy format is re-encrypted and saved before this resolves,
     * as the password is only available here.
     * @param password Hashed or not it will be used, it only needs to match the one used in encryption
     * @returns {Promise<string>} It will not return the wallet itself like the encrypt
     */
    async readDecrypted(password) {
        if (!this.__password) throw new Error('Cannot de-encrypt an key that was not encrypted');
        if (!password || !this.matches(password)) throw new Error('Passwords do not match');
        const wif = cipher.decrypt(this.__wif, password);
        if (cipher.isLegacy(this.__wif)) await this.__upgradeEncryption(wif, password);
        return wif;
    }

    /**
     * Replaces the legacy encrypted key with the current format, in the store and then in memory.
     * Failing to save is not fatal: the wallet keeps working and is upgraded on the next read.
     */
    __upgradeEncryption(wif, password) {
        const legacy = this.__wif;
        const upgraded = cipher.encrypt(wif, password);
        return Wallet.store.update({ address: this.address, wif: legacy }, { $set: { wif: upgraded } }).then(() => {
            this.__wif = upgraded;
        }, (e) => {
            console.error('Could not save the re-encrypted wallet key', e);
        });
    }

    matches(password) {
        return password === this.__password;
    }


    /**
     * Spends the unspent outputs, in order, until they cover the amount and the fee for the size of
     * the transaction, with the receiver's output sized by its address type, as planSpend picks them.
     * The change goes back to this wallet, unless it is below the dust limit and is left to the fee.
     * @param btc The amount in bitcoins
     * @param address The receiver, on the configured network
     * @param rate The fee rate in sat/vB, as network.api.getFee gives it
     * @param password Unlocks the key of an encrypted wallet
     * @returns {Promise<string>} The txid, once broadcast
     */
    async send(btc, address, rate, password) {

        const amount = toSatoshis(btc, 'amount');

        if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) throw new Error(`Not a valid fee rate in sat/vB: ${rate}`);
        const tooSmall = amountError(Number(amount));
        if (tooSmall) throw new Error(tooSmall);
        if (!isValidAddress(address)) throw new Error(`Not a valid ${bnet.name} address: ${address}`);

        const values = this.utxos.map((utxo) => utxo.value);
        const plan = planSpend(values, Number(amount), rate, outputVbytes(address));
        if (!plan.covered) {
            const available = values.reduce((a, v) => a + v, 0);
            throw new Error(`Not enough funds: ${Number(amount) + plan.fee} satoshis needed with the fee, ${available} available`);
        }
        const spent = this.utxos.slice(0, plan.inputs);

        const network = bnet.current;

        const wif = this.__password ? await this.readDecrypted(password) : this.wif;
        const key = ECPair.fromWIF(wif, network);

        const psbt = new bitcoin.Psbt({ network: network });

        // Legacy P2PKH inputs are signed against the whole previous transaction
        const previous = await Promise.all(spent.map((utxo) => bnet.api.getTxHex(utxo.txid)));
        spent.forEach((utxo, i) => {
            const tx = bitcoin.Transaction.fromHex(previous[i]);
            const output = tx.outs[utxo.vout];
            if (tx.getId() !== utxo.txid || !output || output.value !== BigInt(utxo.value)) {
                throw new Error(`The transaction of ${utxo.txid}:${utxo.vout} does not match the unspent output`);
            }
            psbt.addInput({ hash: utxo.txid, index: utxo.vout, nonWitnessUtxo: tx.toBuffer() });
        });

        psbt.addOutput({ address: address, value: amount });
        if (plan.change > 0) psbt.addOutput({ address: this.address, value: BigInt(plan.change) });

        psbt.signAllInputs(key);
        if (!psbt.validateSignaturesOfAllInputs(verifySignature)) throw new Error('The transaction signatures are not valid');
        psbt.finalizeAllInputs();

        const raw = psbt.extractTransaction().toHex();

        return bnet.api.broadcast(raw);
    }


    static get store() {
        if (!Wallet.__store) Wallet.__store = new Database(Wallet.Defaults.DBFileName);
        return Wallet.__store;
    }

    /**
     * Keeps the wallets in the given directory instead of ./db, which is relative to the working directory
     */
    static open(dir) {
        Wallet.__store = new Database(Wallet.Defaults.DBFileName, dir);
    }

    static all() {
        return Wallet.store.find({ network: bnet.name }).then((docs) => {
            return docs.map((doc) => new Wallet(doc));
        });
    }


    static generate() {
        return generateMnemonic();
    }


    static create(name, mnemonic) {

        const seed = mnemonicToSeedSync(mnemonic);

        const master = bip32.fromSeed(seed, bnet.current);
        const derived = master.derivePath(Wallet.Defaults.Path);
        const { address } = bitcoin.payments.p2pkh({ pubkey: derived.publicKey, network: bnet.current });
        const wif = derived.toWIF();

        return new Wallet({
            name: name,
            address: address,
            wif: wif,
            network: bnet.name,
        });

    }

    update() {

        return bnet.api.getUnspentOutputs(this.address).then((utxos) => {
            this.utxos = utxos;
            return true;
        });
    }

    save() {
        return Wallet.store.insert(this.toObject());
    }

    /**
     * @returns {Promise<number>} The number of records removed, once they are
     */
    erase() {
        return Wallet.store.remove({ address: this.address });
    }


    toObject() {

        const obj = {
            name: this.name,
            address: this.address,
            wif: this.wif,
            network: this.network,
        };

        if (this.__password) obj.password = this.__password;

        return obj;
    }

}

Wallet.Defaults = {
    Path: "m/44'/0'/0'/0/0",
    DBFileName: 'wallets',
};

export default Wallet;
