import React from 'react';

import { Input, Icon, Form } from 'antd';

import Constants from './common/constants';
import { isValidAddress } from './common/address';
import { planSpend } from './common/fee';
import { amountError, toSatoshis } from './common/amount';

// With a sign, so that a negative amount is refused as not more than zero rather than as not numeric
const isValidNumber = (value) => /^-?(0|[1-9][0-9]*)(\.[0-9]*)?$/.test(value);

// An empty address is left to the required rule
const isValidBitcoinAddress = (rule, value, callback) => {
    if (!value || isValidAddress(value)) callback();
    else callback('Not a valid bitcoin address for this network');
};

class CreateTransactionForm extends React.Component {

    constructor(props) {
        super(props);

        this.rate = props.rate || 1.0;
        this.feeRate = props.feeRate;
        this.wallet = props.sender;

        this.icons = {
            qrcode: <Icon type="qrcode" style={{ color: 'rgba(0,0,0,.25)' }} />,
            unlock: <Icon type="unlock" style={{ color: 'rgba(0,0,0,.25)' }} />,
        };

        this.convertDollarsToBitcoin = this.convertDollarsToBitcoin.bind(this);
        this.convertBitcoinToDollars = this.convertBitcoinToDollars.bind(this);
    }

    // What Wallet.send spends for the amount: the fee for its inputs, and whether the funds cover it
    planFor(btc) {
        return planSpend(this.wallet.utxoValues, toSatoshis(btc), this.feeRate);
    }

    // Why the amount in bitcoins cannot be sent: not more than zero, below the dust limit, or not covered
    sendError(btc) {
        return amountError(toSatoshis(btc)) || (this.planFor(btc).covered ? undefined : 'Not enough funds');
    }

    // The fee for the inputs that the amount needs, or only the rate until the amount can be sent
    describeFee() {
        const { form } = this.props;
        const btc = form.getFieldValue('bitcoin');
        const rate = `${this.feeRate} sat/vB`;
        if (!isValidNumber(btc) || amountError(toSatoshis(btc))) return `Network fee at ${rate}`;

        const { fee, inputs } = this.planFor(btc);
        const bitcoins = (fee / Constants.Bitcoin.Satoshis).toFixed(Constants.Bitcoin.Decimals);
        return `Network fee: Ƀ ${bitcoins} for ${inputs} ${inputs === 1 ? 'input' : 'inputs'} at ${rate}`;
    }

    convertDollarsToBitcoin(rule, stringValue, callback) {

        const { form } = this.props;

        if (!isValidNumber(stringValue)) {
            callback('The value is not numeric');
            return;
        }

        const value = parseFloat(stringValue);

        const bitcoin = (value * this.rate).toFixed(Constants.Bitcoin.Decimals);

        console.log({
            value: value, bitcoin: bitcoin, feeRate: this.feeRate, coins: this.wallet.coins
        });

        // Also when it cannot be sent, so that both fields show the amount, and the fee below follows it
        form.setFieldsValue({
            bitcoin: bitcoin,
        });

        const error = this.sendError(bitcoin);
        if (error) {
            callback(error);
            return;
        }

        callback();

    }

    convertBitcoinToDollars(rule, value, callback) {

        const { form } = this.props;

        if (!isValidNumber(value)) {
            callback('The value is not numeric');
            return;
        }

        // Also when it cannot be sent: on Send, the dollars check would put back the bitcoins of the old amount
        form.setFieldsValue({
            dollars: value / this.rate,
        });

        const error = this.sendError(value);
        if (error) {
            callback(error);
            return;
        }

        callback();
    }


    render() {

        const { form } = this.props;
        const { getFieldDecorator } = form;


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
                        <Input placeholder="Amount in Dollars" prefix="$" />
                    )}

                </Form.Item>

                <Form.Item extra={this.describeFee()}>

                    {getFieldDecorator('bitcoin', {
                        rules: [{
                            validator: this.convertBitcoinToDollars,
                        }],
                    })(
                        <Input placeholder="Amount in Dollars"
                               prefix="Ƀ" />
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
