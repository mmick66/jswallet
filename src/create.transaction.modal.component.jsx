import React from 'react';

import { Input, Icon, Form } from 'antd';

import Constants from './logic/constants';

const bs58 = require('bs58');

const isValidNumber = value => /^-?(0|[1-9][0-9]*)(\.[0-9]*)?$/.test(value);

const isValidBitcoinAddress = (rule, value, callback) => {
    try {
        bs58.decode(value);
        callback();
    } catch (e) {
        callback(e);
    }
};

class CreateTransactionForm extends React.Component {

    constructor(props) {
        super(props);

        this.rate = props.rate || 1.0;
        this.fees = props.fees || 0.0;
        this.wallet = props.sender;

        this.state = {
            amountInDollars: 0.0,
            amountInBitcoin: 0.0
        };

        this.icons = {
            qrcode: <Icon type="qrcode" style={{ color: 'rgba(0,0,0,.25)' }} />,
            unlock: <Icon type="unlock" style={{ color: 'rgba(0,0,0,.25)' }} />,
        };

        this.convertDollarsToBitcoin = this.convertDollarsToBitcoin.bind(this);
        this.convertBitcoinToDollars = this.convertBitcoinToDollars.bind(this);
    }

    convertDollarsToBitcoin(rule, stringValue, callback) {

        const form = this.props.form;

        if (!isValidNumber(stringValue)) {
            callback('The value is not numeric');
            return;
        }

        const value = parseFloat(stringValue);

        const bitcoin = value * this.rate;

        console.log({ value: value, bitcoin: bitcoin, fees: this.fees, coins: this.wallet.coins });

        if (bitcoin + this.fees >= this.wallet.coins) {
            callback('Not enough funds');
            return;
        }

        form.setFieldsValue({
            bitcoin: bitcoin.toFixed(Constants.Bitcoin.Decimals),
        });

        callback();

    }

    convertBitcoinToDollars(rule, value, callback) {

        const form = this.props.form;

        if (!isValidNumber(value)) {
            callback('The value is not numeric');
            return;
        }

        if (value + this.fees >= this.wallet.coins) {
            callback('Not enough funds');
            return;
        }

        form.setFieldsValue({
            dollars: value / this.rate,
        });

        callback();
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
                            validator: isValidBitcoinAddress,
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
                            validator: this.convertDollarsToBitcoin,
                        }],
                    })(
                        <Input placeholder="Amount in Dollars" prefix={'$'} />
                    )}

                </Form.Item>

                <Form.Item>

                    {getFieldDecorator('bitcoin', {
                        rules: [{
                            validator: this.convertBitcoinToDollars,
                        }],
                    })(
                        <Input placeholder="Amount in Dollars"
                               prefix={'Ƀ'} />
                    )}


                </Form.Item>

                <Form.Item>

                    {getFieldDecorator('password', {
                        rules: [{
                            required: true, message: 'Please input a password',
                        }],
                    })(
                        <Input type="password" placeholder="Unlock" prefix={this.icons.unlock} />
                    )}


                </Form.Item>
            </Form>

        );
    }

}
export default Form.create()(CreateTransactionForm);
