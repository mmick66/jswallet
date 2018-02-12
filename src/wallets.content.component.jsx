import React from 'react';

import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';

import { Button, Table, Modal, message } from 'antd';
import { exchange, blockexplorer } from 'blockchain.info';
import Datastore from 'nedb';


import { clipboard } from 'electron';

import CreateForm from './create.form.modal.component';
import CreateTransaction from './create.transaction.modal.component';
import Hasher from './logic/hasher.util';

const env = require('./env.json');
const network = env.network === 'testnet' ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

class WalletsContent extends React.Component {

    constructor(props) {

        super(props);
        this.state = {
            modalOpenCreate: false,
            modalOpenSend: false,
            price: 1.0,
            coins: 0.0,
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

        this.loadWallets().then((wallets) => {
            this.setState({
                wallets: wallets
            });
            this.loadAllUTXOs();
        }).catch(e => {
            console.log(e);
            message.error('Could not load wallets from database');
        });
    }

    handleCreate() {

        this.form.validateFields((err, values) => {

            if (err) return;

            this.setState({
                creatingKeys: true
            });

            Hasher.hash(values.password).then((hash) => {

                if (err) {
                    message.error('Could not hash the password');
                    return;
                }

                this.form.resetFields();

                this.setState({
                    modalOpenCreate: false,
                });

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

            this.setState({
                modalOpenSend: false,
            });

            const sw = this.state.sourceWallet;

            Hasher.hash(values.password).then((hash) => {

                if (hash !== sw.pass) {

                    message.error('Wrong pass');
                    return;
                }

                const tx = new bitcoin.TransactionBuilder(network);

                let satoshisToSend = values.bitcoin * 100000000;

                let satoshisCurrent = 0;
                for (const utx of sw.utxos) {


                    tx.addInput(utx.tx_hash_big_endian, utx.tx_output_n);

                    satoshisCurrent += utx.value;
                    if (satoshisCurrent >= satoshisToSend) break;
                }

                const change = satoshisCurrent - satoshisToSend;

                tx.addOutput(values.address, satoshisCurrent);
                // if (change > 0) {
                //     tx.addOutput(sw.address, change);
                // }

                const encrypted = sw.encwif;
                const decrypted = Hasher.decrypt(encrypted, hash);
                const key = bitcoin.ECPair.fromWIF(decrypted, network);

                tx.sign(0, key);

                console.log(tx.build().toHex());

            }).catch((e) => {
                console.log(e);
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

        const explorer = env.network === 'testnet' ? blockexplorer.usingNetwork(3) : blockexplorer;

        const walletsToUpdate = this.state.wallets.map(w => Object.assign(w, { updating: true }));

        this.setState({
            wallets: walletsToUpdate,
        });

        const promises = walletsToUpdate.map(w => explorer.getUnspentOutputs(w.address));

        Promise.all(promises).then((all) => {

            all.forEach((obj, i) => {
                walletsToUpdate[i].utxos = obj.unspent_outputs;
                walletsToUpdate[i].coins = obj.unspent_outputs.reduce((a, c) => a + c.value, 0) / 100000000;
            });

            const coins = walletsToUpdate.map(w => w.coins).reduce((acc, curr) => acc + curr, 0);

            this.setState({
                wallets: walletsToUpdate,
                coins: coins,
            });

        }).catch((e) => {

            // an empty result is throwing an error... go figure
            if (e.toString() === 'No free outputs to spend') {
                message.warning('Your wallets are empty.');
            } else {
                message.error('Could not retrieve wallet data.');
            }
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
                    <h3>Total: {`$${(this.state.coins * this.state.price).toFixed(2)}` }</h3>
                </div>
            </div>
        );
    }
}

export default WalletsContent;
