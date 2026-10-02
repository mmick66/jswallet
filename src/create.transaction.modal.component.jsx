import React, { useEffect } from 'react';

import { Input, Form } from 'antd';
import { QrcodeOutlined, UnlockOutlined } from '@ant-design/icons';

import Constants from './common/constants';
import { isValidAddress } from './common/address';
import { outputVbytes, planSpend } from './common/fee';
import { amountError, toSatoshis } from './common/amount';

// With a sign, so that a negative amount is refused as not more than zero rather than as not numeric
const isValidNumber = (value) => /^-?(0|[1-9][0-9]*)(\.[0-9]*)?$/.test(value);

const iconStyle = { color: 'rgba(0,0,0,.25)' };

// An empty address is left to the required rule
const isValidBitcoinAddress = (rule, value) => {
    if (!value || isValidAddress(value)) return Promise.resolve();
    return Promise.reject(new Error('Not a valid bitcoin address for this network'));
};

/**
 * Sends from the sender's wallet. The dollars and bitcoin fields hold the same amount; editing one
 * updates the other, and the bitcoin field is the amount sent.
 * @param form The instance from the parent's Form.useForm(), which validates it
 * @param sender The wallet to send from: { name, address, network, coins, utxoValues }
 * @param feeRate The network fee rate in sat/vB
 * @param rate Bitcoins per dollar
 */
function CreateTransactionForm({
    form, sender, feeRate, rate
}) {

    // Read on each render, so that the checks use the current wallet, fee rate and rate
    const bitcoinsPerDollar = rate || 1.0;
    const toBitcoins = (dollars) => (dollars * bitcoinsPerDollar).toFixed(Constants.Bitcoin.Decimals);

    // Watched so that the fee below the bitcoin field follows the amount and the receiver. Watched values
    // catch up a macrotask after the form's store, so the checks read the address from the store instead.
    const bitcoin = Form.useWatch('bitcoin', form);
    const address = Form.useWatch('address', form);

    // What Wallet.send spends for the amount to the receiver: the fee for its inputs and the receiver's
    // output, and whether the funds cover it. Until a valid address is entered, the output is the largest kind.
    const planFor = (btc, receiver) => planSpend(sender.utxoValues, toSatoshis(btc), feeRate, outputVbytes(receiver));

    // Why the amount in bitcoins cannot be sent to the receiver: not more than zero, below the receiver's dust
    // limit (P2PKH's until a valid address is entered), or not covered
    const sendError = (btc, receiver) => amountError(toSatoshis(btc), receiver)
        || (planFor(btc, receiver).covered ? undefined : 'Not enough funds');

    // The fee for the inputs that the amount needs, or only the rate until the amount can be sent
    const describeFee = () => {
        const atRate = `at ${feeRate} sat/vB`;
        if (!isValidNumber(bitcoin) || amountError(toSatoshis(bitcoin), address)) return `Network fee ${atRate}`;

        const { fee, inputs } = planFor(bitcoin, address);
        const bitcoins = (fee / Constants.Bitcoin.Satoshis).toFixed(Constants.Bitcoin.Decimals);
        return `Network fee: Ƀ ${bitcoins} for ${inputs} ${inputs === 1 ? 'input' : 'inputs'} ${atRate}`;
    };

    // An empty amount is left to the required rule. The dollars field checks the bitcoins it puts in
    // the bitcoin field, which is the amount sent. Both check again when the address changes, as the
    // receiver's output adds to the fee and sets the dust limit.
    const checkAmount = (toAmount) => (rule, value) => {
        if (!value) return Promise.resolve();
        if (!isValidNumber(value)) return Promise.reject(new Error('The value is not numeric'));
        const error = sendError(toAmount(parseFloat(value)), form.getFieldValue('address'));
        return error ? Promise.reject(new Error(error)) : Promise.resolve();
    };

    // The errors shown are those of the last check. Check the amounts again when the wallet, its
    // balance, the fee rate or the rate changes, as when Send opens for another wallet; only those
    // entered or checked already (dirty), so that an empty form does not show its required errors.
    useEffect(() => {
        form.validateFields(['dollars', 'bitcoin'], { dirty: true }).catch(() => {});
    }, [form, sender, feeRate, rate]);

    const onValuesChange = (changed) => {
        if (isValidNumber(changed.dollars)) {
            form.setFieldsValue({ bitcoin: toBitcoins(parseFloat(changed.dollars)) });
        } else if (isValidNumber(changed.bitcoin)) {
            form.setFieldsValue({ dollars: (parseFloat(changed.bitcoin) / bitcoinsPerDollar).toFixed(2) });
        }
    };

    return (
        <Form form={form} name="send-payment" layout="vertical" onValuesChange={onValuesChange}>
            <Form.Item name="address"
                       rules={[{ required: true, message: 'Please input an address!' }, { validator: isValidBitcoinAddress }]}>
                <Input placeholder="Receiver's Address" prefix={<QrcodeOutlined style={iconStyle} />} />
            </Form.Item>

            <Form.Item name="dollars"
                       dependencies={['address']}
                       rules={[{ required: true, message: 'Please input an amount!' }, { validator: checkAmount(toBitcoins) }]}>
                <Input placeholder="Amount in Dollars" prefix="$" />
            </Form.Item>

            <Form.Item name="bitcoin"
                       extra={describeFee()}
                       dependencies={['address']}
                       rules={[{ required: true, message: 'Please input an amount!' }, { validator: checkAmount((btc) => btc) }]}>
                <Input placeholder="Amount in Bitcoin" prefix="Ƀ" />
            </Form.Item>

            <Form.Item name="password" rules={[{ required: true, message: 'Please input a password' }]}>
                <Input type="password" placeholder="Unlock" prefix={<UnlockOutlined style={iconStyle} />} />
            </Form.Item>
        </Form>
    );
}

export default CreateTransactionForm;
