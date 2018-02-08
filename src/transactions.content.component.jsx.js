import React from 'react';
import { blockexplorer } from 'blockchain.info';
import Datastore from 'nedb';
import { Button, Table, Modal, message } from 'antd';
import { clipboard } from "electron";
const env = require('./env.json');
class TransactionsContent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            transactions: []
        };

        this.rawTransactions = [];

        this.showDetails = this.showDetails.bind(this);
        this.parseRawTransactions = this.parseRawTransactions.bind(this);

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

            this.rawTransactions = result;

            const allOutputs = [];
            this.rawTransactions.forEach((tx) => {
                tx.out.forEach((out) => {
                    allOutputs.push({
                        address: out.addr,
                        value: out.value,
                        transaction: tx.hash
                    });
                });
            });

            this.setState({ outputs: allOutputs });


        }).catch(() => {
            message.error('Could not fetch transactions');
        });

    }


    render() {

        const columns = [
            { title: 'Hash', dataIndex: 'hash', key: 'hash' },
            { title: 'Address', dataIndex: 'address', key: 'address' },
            { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
        ];

        // full example: https://codesandbox.io/s/000vqw38rl
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
                       dataSource={this.state.wallets}
                       onRow={onRowFactory}
                       pagination={false}
                       style={{ height: '250px', backgroundColor: 'white' }} />
            </div>
        );
    }
}

export default TransactionsContent;
