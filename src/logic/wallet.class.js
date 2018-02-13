import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';
import crypto from 'crypto';

class Wallet {

    constructor(info) {
        this.__name = info.name;
        this.__address = info.address;
        this.__wif = info.wif;
        this.__network = bitcoin.networks[info.network];

        this.__password = info.password || undefined;

        // public
        this.coins = 0;
        this.utxos = [];
        this.active = true;
    }

    get name() {
        return this.__name;
    }

    get address() {
        return this.__address;
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

    decrypt(password) {
        if (!this.__password) throw new Error('Cannot de-encrypt an key that was not encrypted');
        this.__password = null;
        const cipher = crypto.createDecipher(Wallet.Defaults.Encryption, password);
        return cipher.update(this.__wif, 'hex', 'utf8') + cipher.final('utf8');
    }


    static generate() {
        return bip39.generateMnemonic();
    }


    static create(name, mnemonic, _network) {

        const network = _network || Wallet.Defaults.Network;

        const seed = bip39.mnemonicToSeed();

        const master = bitcoin.HDNode.fromSeedBuffer(seed, bitcoin.networks[network]);
        const derived = master.derivePath("m/44'/0'/0'/0/0");
        const address = derived.getAddress();
        const wif = derived.keyPair.toWIF();

        return new Wallet({
            name: name,
            address: address,
            wif: wif,
            network: network,
        });

    }

    toObject() {

        const obj = {
            name: this.name,
            address: this.address,
            wif: this.wif,
            network: this.network,
        };

        if (this.__password) Object.assign(obj, { password: this.__password });

        return obj;
    }

}

Wallet.Defaults = {
    Network: 'testnet',
    Encryption: 'aes-256-cbc',
};


export default Wallet;
