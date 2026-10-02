import React, { useCallback, useEffect, useState } from 'react';

import {
    App, Button, Form, Table, Modal, Popconfirm
} from 'antd';
import {
    DownSquareOutlined, LoginOutlined, PlusCircleOutlined, ReloadOutlined
} from '@ant-design/icons';

import Constants from './common/constants';
import CreateForm from './create.form.modal.component';
import CreateTransactionForm from './create.transaction.modal.component';
import copyText from './clipboard';
import jswallet from './jswallet';

// Helper Functions

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

function WalletsContent() {

    const { message, modal } = App.useApp();
    const [createForm] = Form.useForm();
    const [sendForm] = Form.useForm();

    const [modalOpenCreate, setModalOpenCreate] = useState(false);
    const [modalOpenSend, setModalOpenSend] = useState(false);
    const [price, setPrice] = useState(1.0);
    const [feeRate, setFeeRate] = useState(null);
    const [wallets, setWallets] = useState([]);
    const [sourceWallet, setSourceWallet] = useState(null);

    // Send stays disabled until a fee rate has loaded: the send form checks the funds against the fee.
    // On failure keep the last rate; Reload retries.
    const loadFee = useCallback(() => {
        jswallet.getFee().then(setFeeRate).catch((e) => {
            console.log('Could not get fee ', e);
        });
    }, []);

    // Resolves with the wallet's new balance in its row
    const refreshWallet = useCallback((wallet) => {
        return jswallet.refreshWallet(wallet.address).then((balance) => {
            setWallets((current) => current.map((w) => (w.address === wallet.address ? { ...w, ...balance } : w)));
        }).catch((e) => {
            console.log(`Could not update wallet ${wallet.name}`, e);
        });
    }, []);

    useEffect(() => {

        jswallet.getPrice().then(setPrice).catch((e) => {
            console.log(e);
        });

        loadFee();

        jswallet.listWallets().then((loaded) => {

            setWallets(loaded);
            loaded.forEach((w) => refreshWallet(w));

        }, (e) => {
            console.log(e);
            message.error('Could not load wallets from database');
        });
    }, [message, loadFee, refreshWallet]);

    // The password goes to the main process as typed; it is hashed there
    const addWallet = (name, password) => {

        jswallet.createWallet({ name: name, password: password }).then(({ wallet, mnemonic }) => {

            setWallets((current) => current.concat([wallet]));

            message.success(Constants.Messages.Wallet.Created);

            setTimeout(() => {
                modal.warning({
                    title: Constants.Messages.Wallet.Mnemonic,
                    content: mnemonic,
                });
            }, 1000);

        }, (e) => {
            modal.error({
                title: Constants.Messages.Wallet.Failed,
                content: e.toString(),
            });
        });
    };

    const handleCreate = () => {

        createForm.validateFields().then((values) => {

            createForm.resetFields();
            setModalOpenCreate(false);

            addWallet(values.name, values.password);
        }, () => {
            // The form shows what is missing
        });

    };

    const handleReload = () => {
        wallets.forEach((w) => refreshWallet(w));
        loadFee();
    };

    const handleSendit = () => {

        sendForm.validateFields().then((values) => {

            setModalOpenSend(false);

            jswallet.sendPayment({
                from: sourceWallet.address, to: values.address, btc: values.bitcoin, password: values.password,
            }).then(() => {
                message.success(Constants.Messages.Transactions.Sent);
                handleReload();
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
                modal.error(info);
            });

        }, () => {
            // The form shows what is wrong
        });


    };

    const handleCancel = () => {
        setModalOpenCreate(false);
        setModalOpenSend(false);
    };

    const total = totalCoins(wallets);

    const openSendModal = (event, record) => {
        event.stopPropagation();
        setSourceWallet(record);
        setModalOpenSend(true);
    };

    const onDeleteRow = (event, record) => {
        event?.stopPropagation();
        jswallet.deleteWallet(record.address).then(() => {
            setWallets((current) => current.filter((w) => w.address !== record.address));
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
                    <Button type="text"
                            style={{ cursor: 'copy' }}
                            onClick={(e) => onAddressClick(e, r)}>
                        {r.address}
                    </Button>
                );
            }
        },
        { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
        {
            title: 'Send',
            key: 'send',
            render: (r) => {
                return (
                    <Button disabled={!(feeRate > 0)} onClick={(e) => openSendModal(e, r)} icon={<LoginOutlined />} />
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
                        <Button type="link">Delete</Button>
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
                  icon={<DownSquareOutlined />}
                  onClick={() => setModalOpenCreate(true)}>
                    Import
                </Button>
                <Button
                  type="primary"
                  icon={<PlusCircleOutlined />}
                  style={{ marginLeft: '8px' }}
                  onClick={() => setModalOpenCreate(true)}>
                    Create
                </Button>
                <Button type="primary"
                        shape="circle"
                        icon={<ReloadOutlined />}
                        style={{ marginLeft: '8px' }}
                        onClick={handleReload} />
            </div>
            <Modal
              title="Create a New Wallet"
              open={modalOpenCreate}
              okText="Create"
              onCancel={handleCancel}
              onOk={handleCreate}>
                <CreateForm form={createForm} />
            </Modal>


            <Table columns={columns}
                   dataSource={wallets}
                   rowKey="address"
                   pagination={false}
                   style={{ height: '250px', backgroundColor: 'white' }} />

            <Modal
                title="Send Money"
                open={modalOpenSend}
                okText="Send"
                onCancel={handleCancel}
                onOk={handleSendit}>
                <CreateTransactionForm
                    form={sendForm}
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

export default WalletsContent;
