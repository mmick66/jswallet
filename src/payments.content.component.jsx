import React from 'react';
import Datastore from 'nedb';

import { Button, Icon, Table, Modal, message } from 'antd';

import TransactionDisplay from './transaction.display';
import Wallet from './logic/wallet.class';
import net from './logic/network';

class PaymentsContent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            payments: [],
            selectedTransaction: null,
            modalOpenTransactionDetails: false,
        };

        this.wallets = {};

        this.showDetails = this.showDetails.bind(this);
        this.handleOk = this.handleOk.bind(this);

        this.db = new Datastore({ filename: './db/wallets.db', autoload: true });
    }

    componentDidMount() {

        Wallet.all().then((wallets) => {

            this.wallets = wallets;

            net.api.getTransactions(wallets.map(w => w.address)).then((txs) => {
                console.log(txs);
                this.transactions = txs;
            });
        });
    }


    set transactions(txs) {

        this._transactions = txs;

        const addressToWallet = {};
        this.wallets.forEach((w) => {
            addressToWallet[w.address] = w;
        });

        const payments = [];

        // transactions come in the order of the addresses passed
        txs.forEach((tx, i) => {

            const wallet = this.wallets[i];

            console.log(tx);

            tx.out.forEach((out, j) => {

                payments.push({
                    key: `${i}/${j}`,
                    name: wallet ? wallet.name : out.addr,
                    address: out.addr,
                    inflow: wallet !== undefined,
                    time: new Date(tx.time * 1000).toDateString(),
                    coins: out.value / 100000000,
                    hash: tx.hash,
                });
            });
        });

        this.setState({
            payments: payments
        });
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
            { title: 'Wallet', dataIndex: 'name', key: 'name' },
            { title: 'Flow', render: (record) => {
                if (record.inflow) {
                    return <span><Icon type={'arrow-left'} /> in</span>;
                }
                return <span>out <Icon type={'arrow-right'} /></span>;
            }
            },
            { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
            { title: 'Date', dataIndex: 'time', key: 'time' },
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
