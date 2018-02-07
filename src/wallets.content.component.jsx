import React from 'react';

import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';

import { Button, Table, Modal, message } from 'antd';
import { exchange, blockexplorer } from 'blockchain.info';
import Datastore from 'nedb';

import crypto from 'crypto';

import CreateForm from './create.form.component';

class WalletsContent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            modalOpenCreate: false,
            price: 1.0,
            coins: 0.0,
            wallets: []
        };

        this.derivationPath = "m/44'/0'/0'/0/0";

        this.handleCreate = this.handleCreate.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.saveFormPntr = this.saveFormPntr.bind(this);
        this.reloadOutput = this.reloadOutput.bind(this);

        this.db = new Datastore({ filename: './db/wallets.db', autoload: true });

    }


    componentDidMount() {

        exchange.getTicker({ currency: 'USD' }).then((r) => {
            this.setState({ price: r.sell });
        }).catch((e) => {
            console.log(e);
        });

        blockexplorer.getUnspentOutputs('').then((r) => {
            this.setState({ price: r.sell });
        }).catch((e) => {
            console.log(e);
        });

        this.db.find({ active: true }, (err, docs) => {

            if (err) {
                message.error('The wallets could not be loaded from the local db!');
                return;
            }

            this.setState({
                wallets: this.state.wallets.concat(docs)
            });

        });
    }

    handleCreate() {

        this.form.validateFields((err, values) => {

            if (err) return;

            crypto.pbkdf2(values.password, 'jswallet', 1024, 48, 'sha512', (err, data) => {
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
        const master = bitcoin.HDNode.fromSeedBuffer(seed, bitcoin.networks.testnet);

        const address = master.derivePath(this.derivationPath).getAddress();
        const privateKey = master.derivePath(this.derivationPath).keyPair.toWIF();

        const cipher = crypto.createCipher('aes-256-cbc', hash);
        const encrypted = cipher.update(privateKey, 'hex') + cipher.final('hex');

        const wallet = {
            key: address,
            name: name,
            address: address,
            coins: 0,
            pvtk: encrypted,
            pass: hash,
            active: true
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


    reloadOutput() {


    }

    render() {
        const columns = [
            { title: 'Name', dataIndex: 'name', key: 'name', render: text => <a>{text}</a> },
            { title: 'Address', dataIndex: 'address', key: 'address' },
            { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
            { title: 'Action', key: 'action', render: () => <a>Delete</a> },
        ];

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
                            onClick={this.reloadOutput} />
                </div>
                <Modal
                  title="Create a New Wallet"
                  visible={this.state.modalOpenCreate}
                  okText="Create"
                  onCancel={this.handleCancel}
                  onOk={this.handleCreate}>
                    <CreateForm
                      ref={this.saveFormPntr}
                      handleCreate={this.handleCreate} />
                </Modal>
                <Table columns={columns} dataSource={this.state.wallets} />
                <div style={{ marginTop: '24px' }}>
                    <h3>Total: {`$${this.state.coins * this.state.price}` }</h3>
                </div>
            </div>
        );
    }
}

export default WalletsContent;
