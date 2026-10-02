import React from 'react';

import { Input, Form, Icon } from 'antd';

class CreateForm extends React.Component {

    constructor(props) {
        super(props);
        this.icons = {
            wallet: <Icon type="wallet" style={{ color: 'rgba(0,0,0,.25)' }} />,
            lock: <Icon type="lock" style={{ color: 'rgba(0,0,0,.25)' }} />
        };
        this.state = {
            confirmDirty: false,
        };

        this.checkConfirm = this.checkConfirm.bind(this);
        this.checkPassword = this.checkPassword.bind(this);
        this.handleConfirmBlur = this.handleConfirmBlur.bind(this);
    }

    checkPassword(rule, value, callback) {
        const { form } = this.props;
        if (value && value !== form.getFieldValue('password')) {
            callback('Two passwords that you enter is inconsistent!');
        } else {
            callback();
        }
    }

    handleConfirmBlur(e) {
        const { value } = e.target;
        const { confirmDirty } = this.state;
        this.setState({ confirmDirty: confirmDirty || !!value });
    }

    checkConfirm(rule, value, callback) {
        const { form } = this.props;
        const { confirmDirty } = this.state;
        if (value && confirmDirty) {
            form.validateFields(['confirm'], { force: true });
        }
        callback();
    }

    render() {
        const { form } = this.props;
        const { getFieldDecorator } = form;
        return (
            <Form layout="vertical">
                <Form.Item>
                    {getFieldDecorator('name', {
                        rules: [{
                            required: true, message: 'Please input your password!',
                        }, {
                            validator: this.checkConfirm,
                        }],
                    })(
                        <Input prefix={this.icons.wallet} placeholder="Wallet Name" />
                    )}
                </Form.Item>

                <Form.Item>
                    {getFieldDecorator('password', {
                        rules: [{
                            required: true, message: 'Please input your password!',
                        }, {
                            validator: this.checkConfirm,
                        }],
                    })(
                        <Input prefix={this.icons.lock} type="password" placeholder="Password" />
                    )}
                </Form.Item>

                <Form.Item>
                    {getFieldDecorator('confirm', {
                        rules: [{
                            required: true, message: 'Please confirm your password!',
                        }, {
                            validator: this.checkPassword,
                        }],
                    })(
                        <Input prefix={this.icons.lock}
                               type="password"
                               placeholder="Confirm Password"
                               onBlur={this.handleConfirmBlur} />
                    )}
                </Form.Item>

            </Form>
        );
    }
}

export default Form.create()(CreateForm);
