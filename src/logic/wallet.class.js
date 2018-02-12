import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';

class Wallet {

    constructor(info) {
        this.__name = info.name;
        this.__address = info.address;
        this.__wif = info.wif;
        this.__encrypted = info.encrypted;
        this.__network = bitcoin.networks[info.netname];
        this.__pass = '';

        // public
        this.coins = 0;
        this.utxos = [];
        this.active = true;
    }

    static generate() {
        return bip39.generateMnemonic();
    }

    static create(mnemonic, netname) {
        const seed = bip39.mnemonicToSeed(mnemonic);
        const master = bitcoin.HDNode.fromSeedBuffer(seed, bitcoin.networks[netname]);
        const derived = master.derivePath("m/44'/0'/0'/0/0");

    }

}

export default Wallet;
