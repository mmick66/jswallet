import React from 'react';

import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';

import { Button, Table, Modal, message } from 'antd';
import { exchange, blockexplorer } from 'blockchain.info';
import Datastore from 'nedb';

import crypto from 'crypto';

import { clipboard } from 'electron';

const env = require('./env.json');

import CreateForm from './create.form.modal.component';


class WalletsContent extends React.Component {

    constructor(props) {

        super(props);
        this.state = {
            modalOpenCreate: false,
            price: 1.0,
            coins: 0.0,
            wallets: [],
            creatingKeys: false
        };

        this.handleCreate = this.handleCreate.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.saveFormPntr = this.saveFormPntr.bind(this);
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

            crypto.pbkdf2(values.password, 'jswallet', 2048, 48, 'sha512', (err, data) => {

                if (err) {
                    message.error('Could not hash the password');
                    return;
                }

                this.form.resetFields();

                this.setState({
                    modalOpenCreate: false,
                });

                const hash = data.toString('hex');
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
        const privateKey = derived.keyPair.toWIF();

        const cipher = crypto.createCipher('aes-256-cbc', hash);
        const encrypted = cipher.update(privateKey, 'hex') + cipher.final('hex');

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
        });
    }

    saveFormPntr(form) {
        this.form = form;
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

        const send = (event) => {
            event.stopPropagation();

        };

        const columns = [
            { title: 'Name', dataIndex: 'name', key: 'name' },
            { title: 'Address', dataIndex: 'address', key: 'address' },
            { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
            { title: 'Send', key: 'send', render: () => <Button onClick={send} icon="login" /> },
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
                      ref={this.saveFormPntr}
                      handleCreate={this.handleCreate} />
                </Modal>

                <Table columns={columns}
                       dataSource={this.state.wallets}
                       onRow={onRowFactory}
                       pagination={false}
                       style={{ height: '250px', backgroundColor: 'white' }} />

                <div style={{ marginTop: '24px' }}>
                    <h3>Total: {`$${(this.state.coins * this.state.price).toFixed(2)}` }</h3>
                </div>
            </div>
        );
    }
}

export default WalletsContent;
