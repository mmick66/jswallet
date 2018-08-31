import React from 'react';

import { Button, Table, Modal, message, Popconfirm } from 'antd';

import { clipboard } from 'electron';

import Constants from './logic/constants';
import CreateForm from './create.form.modal.component';
import CreateTransaction from './create.transaction.modal.component';
import Hasher from './logic/hasher.util';
import Wallet from './logic/wallet.class';
import bnet from './logic/network';

// Helper Functions

const validateFormHashed = (form) => {
    return new Promise((res, rej) => {
        form.validateFields((err, values) => {
            if (err) rej(err);
            Hasher.hash(values.password).then((hash) => {
                values.password = hash;
                res(values);
            }, (e) => {
                rej(e);
            });
        });
    });
};

const formatAmount = (amount) => {
    const nf = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return nf.format(amount);
};

class WalletsContent extends React.Component {

    constructor(props) {

        super(props);
        this.state = {
            modalOpenCreate: false,
            modalOpenSend: false,
            price: 1.0,
            total: 0.0,
            wallets: [],
            sendingPayment: false,
            sourceWallet: null,
        };

        this.handleCreate = this.handleCreate.bind(this);
        this.handleSendit = this.handleSendit.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.handleReload = this.handleReload.bind(this);

    }

    componentDidMount() {

        bnet.api.getPrice('USD').then((r) => {
            this.setState({ price: r.sell });
        }).catch((e) => {
            console.log(e);
        });

        bnet.api.getFee().then((fee) => {
            console.log(fee);
            this.fee = fee;
        }).catch((e) => {
            console.log('Could not get fee ', e);
        });


        Wallet.all().then((wallets) => {

            wallets.forEach((w) => {
                w.on(Wallet.Events.Updated, () => {
                    const newTotal = this.state.wallets.reduce((a, c) => a + c.coins, 0);
                    this.setState({ total: newTotal });
                });
                w.update();
            });

            this.setState({ wallets: wallets });

        }, (e) => {
            console.log(e);
            message.error('Could not load wallets from database');
        });
    }

    handleCreate() {

        validateFormHashed(this.form).then((values) => {

            this.form.resetFields();
            this.setState({ modalOpenCreate: false });

            const mnemonic = Wallet.generate();

            const wallet = Wallet.create(values.name, mnemonic).encrypt(values.password);

            this.__addWallet(wallet, mnemonic);
        });

    }

    __addWallet(wallet, mnemonic) {

        this.setState({
            wallets: this.state.wallets.concat([wallet]),
        });

        wallet.save().then(() => {

            message.success(Constants.Messages.Wallet.Created);

            setTimeout(() => {
                Modal.warning({
                    title: Constants.Messages.Wallet.Mnemonic,
                    content: mnemonic,
                });
            }, 1000);

        }, (e) => {
            Modal.error({
                title: Constants.Messages.Wallet.Failed,
                content: e.toString(),
            });
        });
    }


    handleSendit() {

        validateFormHashed(this.form).then((values) => {

            this.setState({ modalOpenSend: false });

            if (!this.state.sourceWallet.matches(values.password)) {
                message.error('Wrong password entered.');
                return;
            }

            this.state.sourceWallet.send(
                values.bitcoin, values.address, this.fee, values.password
            ).then(() => {
                message.success(Constants.Messages.Transactions.Sent);
                this.handleReload();
            }, (e) => {

                const info = { title: Constants.Messages.Transactions.NOTSent };
                const substring = Constants.ReturnValues.Fragments.MinimumFeeNotMet;
                if (e.toString().includes(substring)) {
                    info.content = Constants.Messages.Errors.FeeNotMet;
                }
                Modal.error(info);
            });

        }, (e) => {
            console.log(e);
            message.error('Bad format for password entered');
        });


    }

    handleCancel() {
        this.setState({
            modalOpenCreate: false,
            modalOpenSend: false,
        });
        this.form = null;
    }

    handleReload() {
        this.state.wallets.forEach(w => w.update());
    }




    render() {

        const openSendModal = (event, record) => {
            event.stopPropagation();
            this.setState({
                sourceWallet: record,
                modalOpenSend: true,
            });
        };

        const onDeleteRow = (event, record) => {
            event.stopPropagation();
            this.setState({
                wallets: this.state.wallets.filter(w => w !== record)
            });
            record.erase();

        };

        const onAddressClick = (event, record) => {
            clipboard.writeText(record.address);
            message.success('Adress copied to the clipboard');
        };


        const columns = [
            { title: 'Name', dataIndex: 'name', key: 'name' },
            { title: 'Address', key: 'address', render: (r) => {
                return (
                        <span tabIndex={0}
                              role="button"
                              style={{ cursor: 'copy' }}
                              onClick={e => onAddressClick(e, r)}>{r.address}</span>
                    );
                }
            },
            { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
            { title: 'Send', key: 'send', render: (r) => {
                return (
                        <Button disabled={this.fees > 0} onClick={e => openSendModal(e, r)} icon="login" />
                    );
                }
            },
            { title: 'Action', key: 'action', render: (r) => {
                return (
                        <Popconfirm title="Sure to delete?"
                                    onConfirm={e => onDeleteRow(e, r)}>
                            <a>Delete</a>
                        </Popconfirm>
                    );
                }
            },
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
                            onClick={this.handleReload} />
                </div>
                <Modal
                  title="Create a New Wallet"
                  visible={this.state.modalOpenCreate}
                  okText="Create"
                  onCancel={this.handleCancel}
                  onOk={this.handleCreate}>
                    <CreateForm
                        ref={form => (this.form = form)}
                        handleCreate={this.handleCreate} />
                </Modal>


                <Table columns={columns}
                       dataSource={this.state.wallets}
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
                        fees={this.fee}
                        rate={1.0 / this.state.price} />
                </Modal>

                <div style={{ marginTop: '24px' }}>
                    <h3>Total: {`${formatAmount(this.state.total * this.state.price)}` }</h3>
                    <span>{`(at ${formatAmount(this.state.price)} per BTC)`}</span>
                </div>
            </div>
        );
    }
}

export default WalletsContent;
