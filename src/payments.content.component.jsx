import React from 'react';
import Datastore from 'nedb';

import { Button, Table, Modal, message } from 'antd';

import TransactionDisplay from './transaction.display';
import Wallet from './logic/wallet.class';
import net from './logic/network';

const env = require('./env.json');

class PaymentsContent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            payments: [],
            selectedTransaction: null,
            modalOpenTransactionDetails: false,
        };

        this.showDetails = this.showDetails.bind(this);
        this.handleOk = this.handleOk.bind(this);

        this.db = new Datastore({ filename: './db/wallets.db', autoload: true });
    }

    componentDidMount() {

        Wallet.all().then((wallets) => {
            net.api.getTransactions(wallets.map(w => w.address)).then((txs) => {
                this.transactions = txs;
            });
        });

    }


    set transactions(data) {

        this._transactions = data;

        const payments = [];
        data.forEach((tx,i) => {
            tx.out.forEach((out, j) => {
                payments.push({
                    key: `${i}/${j}`,
                    address: out.addr,
                    coins: out.value / 100000000,
                    hash: tx.hash,
                });
            });
        });

        this.setState({ payments: payments });
    }

    get transactions() {
        if (!this._transactions) this._transactions = [];
        return this._transactions;
    }

    showDetails(record) {
        const transaction = this.transactions.filter(t => t.hash === record.hash)[0];
        if (!transaction) {
            message.error('Cannot show details for this payment');
            return;
        }
        this.setState({
            selectedTransaction: transaction,
            modalOpenTransactionDetails: true,
        });
    }

    handleOk() {
        this.setState({
            modalOpenTransactionDetails: false,
        });
    }

    render() {

        const columns = [
            { title: 'Address', dataIndex: 'address', key: 'address' },
            { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
        ];

        const onRowFactory = (record) => {
            const config = {};
            config.onClick = () => {
                this.showDetails(record);
            };
            return config;
        };

        return (
            <div>
                <Table columns={columns}
                       dataSource={this.state.payments}
                       onRow={onRowFactory}
                       pagination={false}
                       style={{ height: '250px', backgroundColor: 'white' }} />

                <Modal
                    title="Transaction Details"
                    visible={this.state.modalOpenTransactionDetails}
                    okText="Copy"
                    footer={[
                        <Button key="back" onClick={this.handleOk}>Ok</Button>,
                    ]}>
                    <TransactionDisplay content={this.state.selectedTransaction} />
                </Modal>
            </div>
        );
    }
}

export default PaymentsContent;
