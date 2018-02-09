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
        this.handleSendit = this.handleCreate.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.loadAllUTXOs = this.loadAllUTXOs.bind(this);

        this.db = new Datastore({ filename: './db/wallets.db', autoload: true });
    }


    componentDidMount() {

        exchange.getTicker({ currency: 'USD' }).then((r) => {
            this.setState({ price: r.sell });
        }).catch((e) => {
            console.log(e);
        });

        this.db.find({ active: true }, (err, docs) => {

            if (err) {
                message.error('The wallets could not be loaded from the local db!');
                return;
            }

            this.setState({ wallets: this.state.wallets.concat(docs) });

            this.loadAllUTXOs();
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
            utxos: []
        };

        this.addWallet(wallet);

    }

    handleSendit() {

        Hasher.hash('p').then((hash) => {

            const encrypted = this.state.sourceWallet.encwif;
            const decrypted = Hasher.decrypt(encrypted, hash);
            const key = bitcoin.ECKey.fromWIF(decrypted);

            const tx = new bitcoin.TransactionBuilder();
            tx.addInput("d18e7106e5492baf8f3929d2d573d27d89277f3825d3836aa86ea1d843b5158b", 1);
            tx.addOutput("12idKQBikRgRuZEbtxXQ4WFYB7Wa3hZzhT", 149000);
            tx.sign(0, key);
            console.log(tx.build().toHex());
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
        const wallets = this.state.wallets;
        const promises = wallets.map(w => explorer.getUnspentOutputs(w.address));

        Promise.all(promises).then((all) => {

            all.forEach((obj, i) => {

                const utxos = obj.unspent_outputs;
                wallets[i].utxos = utxos;

                wallets[i].coins = utxos.reduce((acc, curr) => {
                    return acc + curr.value;
                }, 0) / 100000000;
            });

            this.setState({
                wallets: wallets,
                coins: wallets.map(w => w.coins).reduce((acc, curr) => acc + curr, 0),
            });

        }).catch((e) => {
            console.log(e);
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
