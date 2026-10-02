import Channels from '../common/ipc.channels';
import Constants from '../common/constants';
import Hasher from './hasher.util';
import Wallet from './wallet.class';
import bnet from './network';
import * as check from './ipc.arguments';

const Timespans = ['30days', '90days', '1year'];

/**
 * The argument of each channel in Channels, which src/main/security/ipc.js checks before the handler
 * runs. The handlers below trust what these return.
 */
export const ArgumentSchemas = {
    [Channels.ListWallets]: check.none,
    [Channels.CreateWallet]: check.object({
        name: check.text(check.Limits.Name),
        password: check.text(check.Limits.Password),
    }),
    [Channels.DeleteWallet]: check.address,
    [Channels.RefreshWallet]: check.address,
    [Channels.SendPayment]: check.object({
        from: check.address,
        to: check.address,
        btc: check.bitcoins,
        password: check.text(check.Limits.Password),
    }),
    [Channels.GetPrice]: check.none,
    [Channels.GetFee]: check.none,
    [Channels.GetTransactions]: check.addresses,
    [Channels.GetPriceChart]: check.oneOf(Timespans),
    [Channels.WriteClipboard]: check.text(check.Limits.Text),
};

/**
 * A wallet's balance: its coins, and the values in satoshis of the unspent outputs, in the order
 * Wallet.send spends them, so that the send form can show the fee (see planSpend)
 */
const toBalance = (wallet) => ({
    coins: wallet.coins,
    utxoValues: wallet.utxos.map((utxo) => utxo.value),
});

/**
 * What the renderer sees of a wallet. The key, encrypted or not, and the password hash stay in main.
 */
const toDTO = (wallet) => ({
    name: wallet.name,
    address: wallet.address,
    network: wallet.network,
    ...toBalance(wallet),
});

/**
 * The wallets of the configured network by address, read from the store on every call.
 * A wallet keeps its instance between calls, and with it the unspent outputs of its last refresh.
 */
class Wallets {

    constructor() {
        this.byAddress = new Map();
    }

    async all() {
        const stored = await Wallet.all();
        this.byAddress = new Map(stored.map((w) => [w.address, this.byAddress.get(w.address) || w]));
        return [...this.byAddress.values()];
    }

    async get(address) {
        await this.all();
        const wallet = this.byAddress.get(address);
        if (!wallet) throw new Error(`No wallet has the address ${address}`);
        return wallet;
    }

    add(wallet) {
        this.byAddress.set(wallet.address, wallet);
    }

    remove(address) {
        this.byAddress.delete(address);
    }
}

/**
 * The handler of each channel in Channels. A handler takes the one argument that the renderer sent,
 * as its schema in ArgumentSchemas returned it, and returns a promise of plain data. Passwords are
 * hashed here (Hasher.hash), and no key leaves.
 * @param writeClipboard Writes text to the clipboard of the system, for when the renderer cannot
 */
export const createIpcHandlers = ({ writeClipboard }) => {

    const wallets = new Wallets();

    return {
        [Channels.ListWallets]: async () => (await wallets.all()).map(toDTO),

        /**
         * @returns {Promise<{wallet, mnemonic: string}>} The mnemonic is not stored: this is the only time it is shown
         */
        [Channels.CreateWallet]: async ({ name, password }) => {
            const mnemonic = Wallet.generate();
            const wallet = Wallet.create(name, mnemonic).encrypt(await Hasher.hash(password));
            await wallet.save();
            wallets.add(wallet);

            return { wallet: toDTO(wallet), mnemonic: mnemonic };
        },

        [Channels.DeleteWallet]: async (address) => {
            const wallet = await wallets.get(address);
            await wallet.erase();
            wallets.remove(wallet.address);
        },

        [Channels.RefreshWallet]: async (address) => {
            const wallet = await wallets.get(address);
            await wallet.update();
            return toBalance(wallet);
        },

        /**
         * Rejects with a message that contains Constants.ReturnValues.Fragments.WrongPassword
         * if the password is not the wallet's
         */
        [Channels.SendPayment]: async ({
            from, to, btc, password
        }) => {
            const wallet = await wallets.get(from);
            const hash = await Hasher.hash(password);
            if (!wallet.matches(hash)) throw new Error(Constants.ReturnValues.Fragments.WrongPassword);

            // Spends the unspent outputs that the network has now, at the fee rate it asks for now
            const [rate] = await Promise.all([bnet.api.getFee(), wallet.update()]);
            const txid = await wallet.send(btc, to, rate, hash);

            return { txid: txid };
        },

        [Channels.GetPrice]: async () => bnet.api.getPrice(),

        [Channels.GetFee]: async () => bnet.api.getFee(),

        [Channels.GetTransactions]: async (addresses) => bnet.api.getTransactions(addresses),

        [Channels.GetPriceChart]: async (timespan) => bnet.api.getPriceChart(timespan),

        [Channels.WriteClipboard]: async (text) => {
            await writeClipboard(text);
        },
    };
};

/**
 * Answers each channel with its handler, behind the sender checks of handle and the channel's schema.
 * The handler gets the renderer's argument, not the event.
 * @param handle From createIpcHandle (src/main/security/ipc.js)
 * @param handlers From createIpcHandlers
 */
export const registerIpcHandlers = (handle, handlers) => {
    Object.entries(handlers).forEach(([channel, handler]) => {
        handle(channel, ArgumentSchemas[channel], handler);
    });
};
