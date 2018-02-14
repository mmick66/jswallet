import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';
import crypto from 'crypto';

import Datastore from 'nedb';

import Constants from './constants';

import bnet from './network';

class Wallet {

    constructor(info) {
        this.__name = info.name;
        this.__address = info.address;
        this.__wif = info.wif;
        this.__network = info.network;

        this.__password = info.password || undefined;

        // public
        this.__coins = 0;
        this.__utxos = [];

    }

    set utxos(value) {
        this.__utxos = value;
        this.__coins = value.reduce((a, c) => a + c.value, 0) / Constants.Bitcoin.Satoshis;
    }

    get utxos() {
        return this.__utxos;
    }

    get coins() {
        return this.__coins;
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

    encrypt(password) {
        if (this.__password) throw new Error('Cannot re-encrypt an encrypted key');
        this.__password = password;
        const cipher = crypto.createCipher(Wallet.Defaults.Encryption, password);
        return cipher.update(this.__wif, 'utf8', 'hex') + cipher.final('hex');
    }

    readDecrypted(password) {
        if (!this.__password) throw new Error('Cannot de-encrypt an key that was not encrypted');
        if (!password || (password !== this.__password)) throw new Error('Passwords do not match');
        const cipher = crypto.createDecipher(Wallet.Defaults.Encryption, password);
        return cipher.update(this.__wif, 'hex', 'utf8') + cipher.final('utf8');
    }


    send(btc, address, password) {


        const satoshis = Number(btc).toFixed(Constants.Bitcoin.Decimals) * Constants.Bitcoin.Satoshis;

        const network = bnet.current;

        const txb = new bitcoin.TransactionBuilder(network);

        let current = 0;
        for (const utx of this.utxos) {

            txb.addInput(utx.tx_hash_big_endian, utx.tx_output_n);

            current += utx.value;
            if (current >= satoshis) break;
        }

        const change = current - satoshis;

        txb.addOutput(address, current);

        if (change) txb.addOutput(this.address, change);

        const wif = this.__password ? this.readDecrypted(password) : this.wif;
        const key = bitcoin.ECPair.fromWIF(wif, network);

        txb.sign(0, key);

        const raw = txb.build().toHex();

        return bnet.api.broadcast(raw);
    }


    static generate() {
        return bip39.generateMnemonic();
    }


    static create(name, mnemonic) {

        const seed = bip39.mnemonicToSeed(mnemonic);

        const master = bitcoin.HDNode.fromSeedBuffer(seed, bnet.current);
        const derived = master.derivePath(Wallet.Defaults.Path);
        const address = derived.getAddress();
        const wif = derived.keyPair.toWIF();

        return new Wallet({
            name: name,
            address: address,
            wif: wif,
            network: bnet.name,
        });

    }

    static load(q = {}) {
        return new Promise((res, rej) => {
            Wallet.Db.find(q, (err, docs) => {
                if (err) rej(err);
                const wallets = docs.map(doc => new Wallet(doc));
                res(wallets);
            });
        });
    }

    save() {
        return new Promise((res, rej) => {
            Wallet.Db.insert(this.toObject(), (err) => {
                if (err) rej(err);
                res();
            });
        });
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
    Encryption: 'aes-256-cbc',
    Path: "m/44'/0'/0'/0/0",
};

Wallet.Db = new Datastore({ filename: './db/wallets.db', autoload: true });


export default Wallet;
