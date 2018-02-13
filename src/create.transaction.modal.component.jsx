import React from 'react';

import { Input, Icon, Form } from 'antd';

import Constants from './logic/constants';

const bs58 = require('bs58');

const isValidNumber = value => /^-?(0|[1-9][0-9]*)(\.[0-9]*)?$/.test(value);

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
            unlock: <Icon type="unlock" style={{ color: 'rgba(0,0,0,.25)' }} />,
        };

        this.convertDollars = this.convertDollars.bind(this);
        this.convertBitcoin = this.convertBitcoin.bind(this);
        this.checkBitcoinAddress = this.checkBitcoinAddress.bind(this);
    }



    convertDollars(rule, value, callback) {

        const form = this.props.form;

        if (!isValidNumber(value)) {
            callback('The value is not numeric');
        } else {
            form.setFieldsValue({
                bitcoin: (value * this.rate).toFixed(Constants.Bitcoin.Decimals),
            });
            callback();
        }

    }

    convertBitcoin(rule, value, callback) {

        const form = this.props.form;

        if (!isValidNumber(value)) {
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
