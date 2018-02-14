import React from 'react';

import { Button, Table, Modal, message } from 'antd';

import { clipboard } from 'electron';

import Constants from './logic/constants';
import CreateForm from './create.form.modal.component';
import CreateTransaction from './create.transaction.modal.component';
import Hasher from './logic/hasher.util';
import Wallet from './logic/wallet.class';
import bnet from './logic/network';

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

    }

    componentDidMount() {

        bnet.api.getPrice('USD').then((r) => {
            this.setState({ price: r.sell });
        }).catch((e) => {
            console.log(e);
        });

        bnet.api.getFee().then((fee) => {
            this.fee = fee;
        }).catch((e) => {
            console.log('Could not get fee ', e);
        });


        Wallet.load().then((wallets) => {
            this.setState({ wallets: wallets });
            return this.loadAllUTXOs(wallets);
        }, (e) => {
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

                const mnemonic = Wallet.generate();

                const wallet = Wallet.create(values.name, mnemonic);

                wallet.encrypt(hash);

                this.setState({
                    wallets: this.state.wallets.concat([wallet])
                });

                wallet.save().then(() => {

                    message.success(Constants.Messages.Wallet.Created);

                    setTimeout(() => {
                        Modal.warning({
                            title: Constants.Messages.Wallet.Mnemonic,
                            content: mnemonic,
                        });
                    }, 3000);

                }).catch((e) => {
                    Modal.error({
                        title: Constants.Messages.Wallet.Failed,
                        content: e.toString(),
                    });
                });
            });

        });
    }


    handleSendit() {

        this.form.validateFields((err, values) => {

            if (err) return;

            this.setState({ modalOpenSend: false });

            Hasher.hash(values.password).then((hash) => {


                if (hash === this.state.sourceWallet.pass) {
                    this.state.sourceWallet.send(values.bitcoin, values.address, hash);
                } else {
                    message.error('Wrong password.');
                }

            }).catch((e) => {
                console.log(e);
                message.error(e);
            });

        });

    }

    handleCancel() {
        this.setState({
            modalOpenCreate: false,
            modalOpenSend: false,
        });
        this.form = null;
    }


    loadAllUTXOs(wallets) {

        wallets.forEach((wallet, i) => {

            bnet.api.getUnspentOutputs(wallet.address).then((result) => {

                wallet.utxos = result.utxos;
                wallet.coins = result.coins;

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
