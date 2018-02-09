import React from 'react';
import { blockexplorer } from 'blockchain.info';
import Datastore from 'nedb';
import { Button, Table, Modal, message } from 'antd';
const env = require('./env.json');
class TransactionsContent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            transactions: []
        };

        this.showDetails = this.showDetails.bind(this);

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

        const allOutputs = [];
        data.forEach((tx) => {
            tx.out.forEach((out, i) => {
                allOutputs.push({
                    key: i,
                    address: out.addr,
                    coins: out.value / 100000000,
                });
            });
        });

        this.setState({ outputs: allOutputs });
    }

    get transactions() {
        if (!this._transactions) this._transactions = [];
        return this._transactions;
    }

    showDetails(record) {

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
                       dataSource={this.state.outputs}
                       onRow={onRowFactory}
                       pagination={false}
                       style={{ height: '250px', backgroundColor: 'white' }} />
            </div>
        );
    }
}

export default TransactionsContent;
