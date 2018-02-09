import React from 'react';
import { blockexplorer } from 'blockchain.info';
import Datastore from 'nedb';

import TransactionDisplay from './transaction.display';

import { Button, Table, Modal, message } from 'antd';
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

        this.db.find({ active: true }, (err, docs) => {
            if (err) {
                message.error('The wallets could not be loaded from the local db!');
                return;
            }
            this.loadAllTransactions(docs);
        });

    }

    loadAllTransactions(wallets) {

        const addresses = wallets.map(w => w.address);

        const explorer = env.network === 'testnet' ? blockexplorer.usingNetwork(3) : blockexplorer;
        explorer.getMultiAddress(addresses, {}).then((result) => {

            this.transactions = Array.isArray(result.txs) ? result.txs : [];

        }).catch((e) => {
            console.log(e);
            message.error('Could not fetch transactions');
        });

    }

    set transactions(data) {

        this._transactions = data;

        const payments = [];
        data.forEach((tx) => {
            tx.out.forEach((out, i) => {
                payments.push({
                    key: i,
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
