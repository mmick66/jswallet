import React from 'react';

import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';

import { Button, Table, Modal, message } from 'antd';
import { exchange, blockexplorer, pushtx } from 'blockchain.info';
import Datastore from 'nedb';

import { clipboard } from 'electron';

import Constants from './logic/constants';
import CreateForm from './create.form.modal.component';
import CreateTransaction from './create.transaction.modal.component';
import Hasher from './logic/hasher.util';

const env = require('./env.json');

const network = env.network === Constants.Bitcoin.Networks.Testnet ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
const explorer = env.network === Constants.Bitcoin.Networks.Testnet ? blockexplorer.usingNetwork(3) : blockexplorer;

class WalletsContent extends React.Component {

    constructor(props) {

        super(props);
        this.state = {
            modalOpenCreate: false,
            modalOpenSend: false,
            price: 1.0,
            total: 0.0,
            wallets: [],
            creatingKeys: false,
            sendingPayment: false,
            sourceWallet: null,
        };

        this.handleCreate = this.handleCreate.bind(this);
        this.handleSendit = this.handleSendit.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.loadAllUTXOs = this.loadAllUTXOs.bind(this);

        this.db = new Datastore({ filename: './db/wallets.db', autoload: true });
    }

    loadWallets() {
        return new Promise((res, rej) => {
            this.db.find({ active: true }, (err, docs) => {
                if (err) rej(err);
                const wallets = docs.map(doc => Object.assign(doc, { utxos: [] }));
                res(wallets);
            });
        });
    }


    componentDidMount() {

        exchange.getTicker({ currency: 'USD' }).then((r) => {
            this.setState({ price: r.sell });
        }).catch((e) => {
            console.log(e);
        });

        explorer.getLatestBlock().then((block) => {
            explorer.getBlock(block.hash).then((block) => {
                this.fee = block.fee;
            }).catch((e) => {
                console.log('Could not get block ', e);
            });
        });

        this.loadWallets().then((wallets) => {
            this.setState({
                wallets: wallets
            });
            this.loadAllUTXOs();
        }).catch((e) => {
            console.log(e);
            message.error('Could not load wallets from database');
        });
    }

    handleCreate() {

        this.form.validateFields((err, values) => {

            if (err) return;

            this.setState({ creatingKeys: true });

            Hasher.hash(values.password).then((hash) => {
                if (err) {
                    message.error('Could not hash the password');
                    return;
                }
                this.form.resetFields();
                this.setState({ modalOpenCreate: false });

                this.createWallet(values.name, hash);
            });

        });
    }


    createWallet(name, hash) {

        const mnemonic = bip39.generateMnemonic();

        const seed = bip39.mnemonicToSeed(mnemonic);
        const master = bitcoin.HDNode.fromSeedBuffer(seed, bitcoin.networks[env.network]);

        const derived = master.derivePath("m/44'/0'/0'/0/0");
        const address = derived.getAddress();
        const wif = derived.keyPair.toWIF();

        const encrypted = Hasher.encrypt(wif, hash);

        const wallet = {
            key: address,
            name: name,
            address: address,
            coins: 0,
            encwif: encrypted,
            pass: hash,
            active: true,
            utxos: [],
        };

        this.addWallet(wallet);

    }

    handleSendit() {

        this.form.validateFields((err, values) => {

            if (err) return;

            this.setState({ modalOpenSend: false });

            const sw = this.state.sourceWallet;

            Hasher.hash(values.password).then((hash) => {

                if (hash !== sw.pass) {
                    message.error('Wrong password.');
                    return;
                }

                const txb = new bitcoin.TransactionBuilder(network);

                const satoshisToSend = Number(values.bitcoin).toFixed(Constants.Bitcoin.Decimals) * Constants.Bitcoin.Satoshis;

                let inputAmount = 0;
                for (const utx of sw.utxos) {

                    txb.addInput(utx.tx_hash_big_endian, utx.tx_output_n);

                    inputAmount += utx.value;
                    if (inputAmount >= (satoshisToSend + this.fee)) break;
                }

                const change = inputAmount - (satoshisToSend + this.fee);

                txb.addOutput(values.address, satoshisToSend);

                if (change) txb.addOutput(sw.address, change);

                const encrypted = sw.encwif;
                const decrypted = Hasher.decrypt(encrypted, hash);
                const key = bitcoin.ECPair.fromWIF(decrypted, network);

                txb.sign(0, key);

                const raw = txb.build().toHex();

                const api = env.network === Constants.Bitcoin.Networks.Testnet ? pushtx.usingNetwork(3) : pushtx;

                api.pushtx(raw).then((r) => {
                    if (r === Constants.ReturnValues.TransactionSubmitted) {
                        message.success('Transaction Send!');
                        this.loadAllUTXOs();

                    } else {
                        message.error('Transaction could not be sent');
                    }
                    console.log(r);
                });


            }).catch((e) => {
                console.log(e);
                message.error(e);
            });

        });

    }

    addWallet(wallet) {

        this.setState({
            wallets: this.state.wallets.concat([wallet])
        });

        this.db.insert(wallet, (err) => {
            if (err) {
                message.warning('The wallet could not saved to the local db!');
            } else {
                message.success('This wallet was saved to the local db!');
            }
        });
    }

    handleCancel() {
        this.setState({
            modalOpenCreate: false,
            modalOpenSend: false,
        });
        this.form = null;
    }


    loadAllUTXOs() {

        this.state.wallets.forEach((wallet, i) => {

            explorer.getUnspentOutputs(wallet.address).then((result) => {

                wallet.utxos = result.unspent_outputs;
                wallet.coins = result.unspent_outputs.reduce((a, c) => a + c.value, 0) / Constants.Bitcoin.Satoshis;

                this.state.wallets.splice(i, 1, wallet);
                this.setState({ wallets: this.state.wallets, total: this.state.total + wallet.coins });

            }).catch((e) => {

                // an empty result is throwing an error... go figure
                if (e.toString() === 'No free outputs to spend') {
                    console.log('No free outputs for ' + wallet.address);
                } else {
                    console.log(e);
                    message.error('Could not retrieve data for ' + wallet.address);
                }
            });
        });

    }

    render() {

        const openSendModal = (event, record) => {
            event.stopPropagation();
            this.setState({
                sourceWallet: record,
                modalOpenSend: true,
            });
        };

        const columns = [
            { title: 'Name', dataIndex: 'name', key: 'name' },
            { title: 'Address', dataIndex: 'address', key: 'address' },
            { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
            { title: 'Send', key: 'send', render: r => <Button onClick={e => openSendModal(e, r)} icon="login" /> },
            { title: 'Action', key: 'action', render: () => <a>Delete</a> },
        ];

        // full example: https://codesandbox.io/s/000vqw38rl
        const onRowFactory = (record) => {
            const config = {};
            config.onClick = () => {
                clipboard.writeText(record.address);
                message.success('Adress copied to the clipboard');
            };
            return config;
        };

        return (
            <div className="Wallets">
                <div style={{ marginBottom: '12px' }}>
                    <Button
                      type="primary"
                      icon="down-square-o"
                      onClick={() => this.setState({ modalOpenCreate: true, })}>Import
                    </Button>
                    <Button
                      type="primary"
                      icon="plus-circle-o"
                      style={{ marginLeft: '8px' }}
                      onClick={() => this.setState({ modalOpenCreate: true, })}>Create
                    </Button>
                    <Button type="primary"
                            shape="circle"
                            icon="reload"
                            style={{ marginLeft: '8px' }}
                            onClick={this.loadAllUTXOs} />
                </div>
                <Modal
                  title="Create a New Wallet"
                  visible={this.state.modalOpenCreate}
                  okText="Create"
                  onCancel={this.handleCancel}
                  confirmLoading={this.state.creatingKeys}
                  onOk={this.handleCreate}>
                    <CreateForm
                        ref={form => (this.form = form)}
                        handleCreate={this.handleCreate} />
                </Modal>

                <Table columns={columns}
                       dataSource={this.state.wallets}
                       onRow={onRowFactory}
                       pagination={false}
                       style={{ height: '250px', backgroundColor: 'white' }} />

                <Modal
                    title="Send Money"
                    visible={this.state.modalOpenSend}
                    okText="Send"
                    onCancel={this.handleCancel}
                    confirmLoading={this.state.sendingPayment}
                    onOk={this.handleSendit}>
                    <CreateTransaction
                        ref={form => (this.form = form)}
                        sender={this.state.sourceWallet}
                        rate={1.0 / this.state.price} />
                </Modal>

                <div style={{ marginTop: '24px' }}>
                    <h3>Total: {`$${(this.state.total * this.state.price).toFixed(2)}` }</h3>
                </div>
            </div>
        );
    }
}

export default WalletsContent;
