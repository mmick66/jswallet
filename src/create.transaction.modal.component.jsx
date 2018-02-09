import React from 'react';

import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';

import { Input, Icon, Form } from 'antd';

import crypto from 'crypto';

import { clipboard } from 'electron';

const env = require('./env.json');


class CreateTransaction extends React.Component {

    constructor(props) {
        super(props);

        this.rate = props.rate || 1.0;

        console.log(this.rate);

        this.state = {
            amountInDollars: 0.0,
            amountInBitcoin: 0.0
        };

        this.handleNewDollarAmount = this.handleNewDollarAmount.bind(this);
    }

    handleNewDollarAmount(e) {


        const inpValue = e.target.value;
        const newValue = Number(inpValue);
        if (Number.isNaN(newValue)) {
            return;
        }
        this.setState({
            amountInDollars: inpValue,
            amountInBitcoin: newValue * this.rate
        });
    }

    render() {
        return (
            <Form layout="vertical">
                <Form.Item>
                    <Input
                        placeholder="Receiver's Address"
                        prefix={<Icon type="qrcode" style={{ color: 'rgba(0,0,0,.25)' }} />} />
                </Form.Item>

                <Form.Item>
                    <Input
                        placeholder="Amount in Dollars"
                        onChange={this.handleNewDollarAmount}
                        value={this.state.amountInDollars}
                        prefix={'$'} />
                </Form.Item>

                <Form.Item>
                    <Input
                        placeholder="Amount in Dollars"
                        onChange={this.handleNewDollarAmount}
                        value={this.state.amountInBitcoin}
                        prefix={'Ƀ'} />
                </Form.Item>
            </Form>

        );
    }

}

export default CreateTransaction;
