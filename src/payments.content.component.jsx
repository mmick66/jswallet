import React, { useEffect, useState } from 'react';

import {
    App, Button, Table, Modal
} from 'antd';
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';

import TransactionDisplay from './transaction.display';
import toPaymentRows from './payments.rows';
import jswallet from './jswallet';

const columns = [
    { title: 'Wallet', dataIndex: 'name', key: 'name' },
    {
        title: 'Flow',
        key: 'flow',
        render: (record) => {
            if (record.inflow) {
                return (
                    <span>
                        <ArrowLeftOutlined />
                        {' in'}
                    </span>
                );
            }
            return (
                <span>
                    {'out '}
                    <ArrowRightOutlined />
                </span>
            );
        }
    },
    { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
    { title: 'Date', dataIndex: 'time', key: 'time' },
];

function PaymentsContent() {

    const { message } = App.useApp();

    const [transactions, setTransactions] = useState([]);
    const [payments, setPayments] = useState([]);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [modalOpenTransactionDetails, setModalOpenTransactionDetails] = useState(false);

    useEffect(() => {

        jswallet.listWallets().then((wallets) => {
            return jswallet.getTransactions(wallets.map((w) => w.address)).then((txs) => {
                setTransactions(txs);
                setPayments(toPaymentRows(txs, wallets));
            });
        }).catch((e) => {
            console.log(e);
            message.error('Could not load payments');
        });
    }, [message]);

    const showDetails = (record) => {
        const transaction = transactions.filter((t) => t.hash === record.hash)[0];
        if (!transaction) {
            message.error('Cannot show details for this payment');
            return;
        }
        setSelectedTransaction(transaction);
        setModalOpenTransactionDetails(true);
    };

    const handleOk = () => {
        setModalOpenTransactionDetails(false);
    };

    const onRowFactory = (record) => {
        const config = {};
        config.onClick = () => {
            showDetails(record);
        };
        return config;
    };

    return (
        <div>
            <Table columns={columns}
                   dataSource={payments}
                   onRow={onRowFactory}
                   pagination={false}
                   style={{ height: '250px', backgroundColor: 'white' }} />

            <Modal
                title="Transaction Details"
                open={modalOpenTransactionDetails}
                onCancel={handleOk}
                footer={[
                    <Button key="back" onClick={handleOk}>Ok</Button>,
                ]}>
                <TransactionDisplay content={selectedTransaction} />
            </Modal>
        </div>
    );
}

export default PaymentsContent;
