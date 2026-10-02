import React from 'react';

import { Input, Form } from 'antd';
import { LockOutlined, WalletOutlined } from '@ant-design/icons';

const iconStyle = { color: 'rgba(0,0,0,.25)' };

// Re-checked when the password changes (see dependencies)
const matchesPassword = ({ getFieldValue }) => ({
    validator(rule, value) {
        if (!value || value === getFieldValue('password')) return Promise.resolve();
        return Promise.reject(new Error('Two passwords that you enter is inconsistent!'));
    },
});

/**
 * @param form The instance from the parent's Form.useForm(), which validates and resets it
 */
function CreateForm({ form }) {
    return (
        <Form form={form} name="create-wallet" layout="vertical">
            <Form.Item name="name" rules={[{ required: true, message: 'Please input a wallet name!' }]}>
                <Input prefix={<WalletOutlined style={iconStyle} />} placeholder="Wallet Name" />
            </Form.Item>

            <Form.Item name="password" rules={[{ required: true, message: 'Please input your password!' }]}>
                <Input prefix={<LockOutlined style={iconStyle} />} type="password" placeholder="Password" />
            </Form.Item>

            <Form.Item name="confirm"
                       dependencies={['password']}
                       rules={[{ required: true, message: 'Please confirm your password!' }, matchesPassword]}>
                <Input prefix={<LockOutlined style={iconStyle} />} type="password" placeholder="Confirm Password" />
            </Form.Item>
        </Form>
    );
}

export default CreateForm;
