import React from 'react';

import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';

import { Button, Table, Modal } from 'antd';
import { exchange, blockexplorer } from 'blockchain.info';

import CreateForm from './create.form.component';

class WalletsContent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            modalOpen: false,
            price: 1.0,
            coins: 0.0,
        };

        this.derivationPath = "m/44'/0'/0'/0/0";
        this.wallets = [];

        this.handleCreate = this.handleCreate.bind(this);
        this.handleCancel = this.handleCancel.bind(this);
        this.saveFormPntr = this.saveFormPntr.bind(this);
    }


    componentDidMount() {
        exchange.getTicker({ currency: 'USD' }).then((r) => {
            this.setState({ price: r.sell });
        }).catch((e) => {
            console.log(e);
        });

        blockexplorer.getUnspentOutputs('').then((r) => {
            this.setState({ price: r.sell });
        }).catch((e) => {
            console.log(e);
        });
    }

    showModal() {
        this.setState({
            modalOpen: true,
        });
    }

    handleCreate() {
        this.form.validateFields((err, values) => {
            if (err) return;

            const name = values.name;
            const net = 'testnet';
            const master = this.createKey(net);

            const address = master.derivePath(this.derivationPath).getAddress();
            // let privateKey  = master.derivePath(this.derivationPath).keyPair.toWIF();

            this.wallets.push({
                key: address,
                name,
                address,
                net,
            });

            this.form.resetFields();

            this.setState({
                modalOpen: false,
            });
        });
    }

    handleCancel() {
        this.setState({
            modalOpen: false,
        });
    }

    saveFormPntr(form) {
        this.form = form;
    }

    createKey (network) {
        const mnemonic = bip39.generateMnemonic();
        const seed = bip39.mnemonicToSeed(mnemonic);
        const master = bitcoin.HDNode.fromSeedBuffer(seed, bitcoin.networks[network || 'testnet']);

        return master;
    }

    render() {
        const columns = [
            { title: 'Name', dataIndex: 'name', key: 'name', render: text => <a href="#">{text}</a> },
            { title: 'Address', dataIndex: 'address', key: 'address' },
            { title: 'Network', dataIndex: 'net', key: 'net' },
            { title: 'Action', key: 'action', render: () => <a href="#">Delete</a> },
        ];

        return (
            <div className="Wallets">
                <div style={{ marginBottom: '12px' }}>
                    <Button
                      type="primary"
                      icon="down-square-o"
                      onClick={this.showModal}>Import
                    </Button>
                    <span style={{ marginRight: '8px' }} />
                    <Button
                      type="primary"
                      icon="plus-circle-o"
                      onClick={this.showModal}>Create
                    </Button>
                </div>
                <Modal
                  title="Create a New Wallet"
                  visible={this.state.modalOpen}
                  okText="Create"
                  onCancel={this.handleCancel}
                  onOk={this.handleCreate}>
                    <CreateForm
                      ref={this.saveFormPntr}
                      handleCreate={this.handleCreate} />
                </Modal>
                <Table columns={columns} dataSource={this.wallets} />
                <div style={{ marginTop: '24px' }}>
                    <h3>Total: {`$${this.state.coins * this.state.price}` }</h3>
                </div>
            </div>
        );
    }
}

export default WalletsContent;
