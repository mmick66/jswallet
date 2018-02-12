import React from 'react';

import { Input, Icon, Form } from 'antd';

import crypto from 'crypto';

import { clipboard } from 'electron';

const bs58 = require('bs58')
const env = require('./env.json');

class CreateTransactionForm extends React.Component {

    constructor(props) {
        super(props);

        this.rate = props.rate || 1.0;


        this.state = {
            amountInDollars: 0.0,
            amountInBitcoin: 0.0
        };

        this.icons = {
            qrcode: <Icon type="qrcode" style={{ color: 'rgba(0,0,0,.25)' }} />,
        };

        this.convertDollars = this.convertDollars.bind(this);
        this.convertBitcoin = this.convertBitcoin.bind(this);
        this.checkBitcoinAddress = this.checkBitcoinAddress.bind(this);
    }

    convertDollars(rule, value, callback) {

        const form = this.props.form;

        if (Number.isNaN(Number(value))) {
            callback('The value is not numeric');
        } else {
            form.setFieldsValue({
                bitcoin: value * this.rate
            });
            callback();
        }

    }

    convertBitcoin(rule, value, callback) {

        const form = this.props.form;

        if (Number.isNaN(Number(value))) {
            callback('The value is not numeric');
        } else {
            form.setFieldsValue({
                dollars: value / this.rate
            });
            callback();
        }

    }

    checkBitcoinAddress(rule, value, callback) {
        try {
            bs58.decode(value);
            callback();
        } catch (e) {
            callback(e);
        }
    }

    render() {

        const { getFieldDecorator } = this.props.form;

        return (
            <Form layout="vertical">
                <Form.Item>
                    {getFieldDecorator('address', {
                        rules: [{
                            required: true, message: 'Please input an address!',
                        }, {
                            validator: this.checkBitcoinAddress,
                        }],
                    })(
                        <Input placeholder="Receiver's Address" prefix={this.icons.qrcode} />
                    )}

                </Form.Item>

                <Form.Item>

                    {getFieldDecorator('dollars', {
                        rules: [{
                            required: true, message: 'Please input an address!',
                        }, {
                            validator: this.convertDollars,
                        }],
                    })(
                        <Input placeholder="Amount in Dollars" prefix={'$'} />
                    )}


                </Form.Item>

                <Form.Item>

                    {getFieldDecorator('bitcoin', {
                        rules: [{
                            validator: this.convertBitcoin,
                        }],
                    })(
                        <Input
                            placeholder="Amount in Dollars"
                            onChange={this.handleNewDollarAmount}
                            prefix={'Ƀ'} />
                    )}


                </Form.Item>
            </Form>

        );
    }

}
export default Form.create()(CreateTransactionForm);
