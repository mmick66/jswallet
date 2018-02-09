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

        this.handleChange = this.handleChange;
    }

    handleChange(e) {
        console.log(e);
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
                        onChange={this.handleChange}
                        prefix={<Icon type="wallet" style={{ color: 'rgba(0,0,0,.25)' }} />} />
                </Form.Item>

                <Form.Item>
                    <Input
                        placeholder="Amount in Bitcoin"
                        onChange={this.handleChange}
                        prefix={<Icon type="wallet" style={{ color: 'rgba(0,0,0,.25)' }} />} />
                </Form.Item>
            </Form>

        );
    }

}

export default CreateTransaction;
