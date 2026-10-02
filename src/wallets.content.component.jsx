import React from 'react';

import {
    Button, Table, Modal, message, Popconfirm
} from 'antd';

import Constants from './common/constants';
import CreateForm from './create.form.modal.component';
import CreateTransaction from './create.transaction.modal.component';
import copyText from './clipboard';
import jswallet from './jswallet';

// Helper Functions

// The password goes to the main process as typed; it is hashed there
const validateForm = (form) => {
    return new Promise((res, rej) => {
        form.validateFields((err, values) => {
            if (err) rej(err);
            else res(values);
        });
    });
};

const totalCoins = (wallets) => wallets.reduce((a, w) => a + w.coins, 0);

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
            feeRate: null,
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

        jswallet.getPrice().then((price) => {
            this.setState({ price: price });
        }).catch((e) => {
            console.log(e);
        });

        this.loadFee();

        jswallet.listWallets().then((wallets) => {

            this.setState({ wallets: wallets });
            wallets.forEach((w) => this.refreshWallet(w));

        }, (e) => {
            console.log(e);
            message.error('Could not load wallets from database');
        });
    }

    // Send stays disabled until a fee rate has loaded: the send form checks the funds against the fee.
    // On failure keep the last rate; Reload retries.
    loadFee() {
        jswallet.getFee().then((feeRate) => {
            this.setState({ feeRate: feeRate });
        }).catch((e) => {
            console.log('Could not get fee ', e);
        });
    }

    // Resolves with the wallet's new balance in its row
    refreshWallet(wallet) {
        return jswallet.refreshWallet(wallet.address).then((balance) => {
            this.setState(({ wallets }) => ({
                wallets: wallets.map((w) => (w.address === wallet.address ? { ...w, ...balance } : w)),
            }));
        }).catch((e) => {
            console.log(`Could not update wallet ${wallet.name}`, e);
        });
    }

    handleCreate() {

        validateForm(this.form).then((values) => {

            this.form.resetFields();
            this.setState({ modalOpenCreate: false });

            this.__addWallet(values.name, values.password);
        }, () => {
            // The form shows what is missing
        });

    }

    __addWallet(name, password) {

        jswallet.createWallet({ name: name, password: password }).then(({ wallet, mnemonic }) => {

            this.setState(({ wallets }) => ({
                wallets: wallets.concat([wallet]),
            }));

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

        validateForm(this.form).then((values) => {

            this.setState({ modalOpenSend: false });

            const { sourceWallet } = this.state;

            jswallet.sendPayment({
                from: sourceWallet.address, to: values.address, btc: values.bitcoin, password: values.password,
            }).then(() => {
                message.success(Constants.Messages.Transactions.Sent);
                this.handleReload();
            }, (e) => {

                if (e.message.includes(Constants.ReturnValues.Fragments.WrongPassword)) {
                    message.error('Wrong password entered.');
                    return;
                }

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
        const { wallets } = this.state;
        wallets.forEach((w) => this.refreshWallet(w));
        this.loadFee();
    }




    render() {

        const {
            modalOpenCreate, modalOpenSend, sendingPayment, sourceWallet, wallets, price, feeRate
        } = this.state;

        const total = totalCoins(wallets);

        const openSendModal = (event, record) => {
            event.stopPropagation();
            this.setState({
                sourceWallet: record,
                modalOpenSend: true,
            });
        };

        const onDeleteRow = (event, record) => {
            event.stopPropagation();
            jswallet.deleteWallet(record.address).then(() => {
                this.setState(({ wallets: current }) => ({
                    wallets: current.filter((w) => w.address !== record.address)
                }));
            }, (e) => {
                console.log(e);
                message.error(`Could not delete wallet ${record.name}`);
            });

        };

        const onAddressClick = (event, record) => {
            copyText(record.address).then(() => {
                message.success('Adress copied to the clipboard');
            }, (e) => {
                console.log(e);
                message.error('Could not copy the address');
            });
        };


        const columns = [
            { title: 'Name', dataIndex: 'name', key: 'name' },
            {
                title: 'Address',
                key: 'address',
                render: (r) => {
                    return (
                        <span tabIndex={0}
                              role="button"
                              style={{ cursor: 'copy' }}
                              onClick={(e) => onAddressClick(e, r)}>
                            {r.address}
                        </span>
                    );
                }
            },
            { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
            {
                title: 'Send',
                key: 'send',
                render: (r) => {
                    return (
                        <Button disabled={!(feeRate > 0)} onClick={(e) => openSendModal(e, r)} icon="login" />
                    );
                }
            },
            {
                title: 'Action',
                key: 'action',
                render: (r) => {
                    return (
                        <Popconfirm title="Sure to delete?"
                                    onConfirm={(e) => onDeleteRow(e, r)}>
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
                      onClick={() => this.setState({ modalOpenCreate: true, })}>
                        Import
                    </Button>
                    <Button
                      type="primary"
                      icon="plus-circle-o"
                      style={{ marginLeft: '8px' }}
                      onClick={() => this.setState({ modalOpenCreate: true, })}>
                        Create
                    </Button>
                    <Button type="primary"
                            shape="circle"
                            icon="reload"
                            style={{ marginLeft: '8px' }}
                            onClick={this.handleReload} />
                </div>
                <Modal
                  title="Create a New Wallet"
                  visible={modalOpenCreate}
                  okText="Create"
                  onCancel={this.handleCancel}
                  onOk={this.handleCreate}>
                    <CreateForm
                        ref={(form) => (this.form = form)}
                        handleCreate={this.handleCreate} />
                </Modal>


                <Table columns={columns}
                       dataSource={wallets}
                       rowKey="address"
                       pagination={false}
                       style={{ height: '250px', backgroundColor: 'white' }} />

                <Modal
                    title="Send Money"
                    visible={modalOpenSend}
                    okText="Send"
                    onCancel={this.handleCancel}
                    confirmLoading={sendingPayment}
                    onOk={this.handleSendit}>
                    <CreateTransaction
                        ref={(form) => (this.form = form)}
                        sender={sourceWallet}
                        feeRate={feeRate}
                        rate={1.0 / price} />
                </Modal>

                <div style={{ marginTop: '24px' }}>
                    <h3>
                        {'Total: '}
                        {`${formatAmount(total * price)}` }
                    </h3>
                    <span>{`(at ${formatAmount(price)} per BTC)`}</span>
                </div>
            </div>
        );
    }
}

export default WalletsContent;
