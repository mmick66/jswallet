import React from 'react';

import bip39 from 'bip39';
import bitcoin from 'bitcoinjs-lib';

import { Input, Icon } from 'antd';

import crypto from 'crypto';

import { clipboard } from 'electron';

const env = require('./env.json');


class CreateTransaction extends React.Component {

    render() {
        return (
          <div>
              <Input
                  placeholder="Receiver's Address"
                  prefix={<Icon type="qrcode" style={{ color: 'rgba(0,0,0,.25)' }} />} />

              <Input
                  placeholder="Amount in Dollars"
                  prefix={<Icon type="wallet" style={{ color: 'rgba(0,0,0,.25)' }} />} />

              <Input
                  placeholder="Amount in Bitcoin"
                  prefix={<Icon type="wallet" style={{ color: 'rgba(0,0,0,.25)' }} />} />

          </div>
        );
    }

}

export default CreateTransaction;
