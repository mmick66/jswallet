// Captures golden-vectors.json with Wallet.create as implemented before jswallet-2cb.5
// (bitcoinjs-lib 3.3.2 and bip39 2.6.0, as locked then) on Node 20. Run it in a scratch dir:
//   npx -p node@20 -- sh -c 'npm i bitcoinjs-lib@3.3.2 bip39@2.6.0 && node capture-golden-vectors.cjs'
const bip39 = require('bip39');
const bitcoin = require('bitcoinjs-lib');

const PATH = "m/44'/0'/0'/0/0";
const MNEMONICS = [
    'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    'legal winner thank year wave sausage worth useful legal winner thank yellow',
    'void come effort suffer camp survey warrior heavy shoot primary clutch crush open amazing screen patrol group space point ten exist slush involve unfold',
];

const vectors = MNEMONICS.map((mnemonic) => {
    if (!bip39.validateMnemonic(mnemonic)) throw new Error(`invalid ${mnemonic}`);
    const entry = { mnemonic: mnemonic, path: PATH };
    for (const name of ['testnet', 'bitcoin']) {
        const seed = bip39.mnemonicToSeed(mnemonic);
        const master = bitcoin.HDNode.fromSeedBuffer(seed, bitcoin.networks[name]);
        const derived = master.derivePath(PATH);
        entry[name] = { address: derived.getAddress(), wif: derived.keyPair.toWIF() };
    }
    return entry;
});

console.log(JSON.stringify({
    generatedWith: { node: process.version, 'bitcoinjs-lib': require('bitcoinjs-lib/package.json').version, bip39: require('bip39/package.json').version },
    vectors: vectors,
}, null, 2));
