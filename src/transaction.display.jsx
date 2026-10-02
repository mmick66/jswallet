import React from 'react';
import { List } from 'antd';

const describe = (entry) => `${entry.address || '(no address)'} ${entry.value}`;

class TransactionDisplay extends React.Component {

    constructor(props) {
        super(props);

        const transaction = props.content;

        console.log(transaction);

        if (transaction) {
            this.state = {
                hash: transaction.hash,
                inputs: transaction.inputs.map(describe),
                outputs: transaction.outputs.map(describe),
            };
        } else {
            this.state = {
                hash: '',
                inputs: [],
                outputs: [],
            };
        }

    }

    render() {

        const { hash, inputs, outputs } = this.state;

        return (
            <div>
                <h3>{ hash }</h3>

                <h4>Inputs</h4>
                <List
                    size="small"
                    header={<div>Header</div>}
                    footer={<div>Footer</div>}
                    bordered
                    dataSource={inputs}
                    renderItem={(item) => (<List.Item>{item}</List.Item>)} />

                <h4>Outputs</h4>
                <List
                    size="small"
                    header={<div>Header</div>}
                    footer={<div>Footer</div>}
                    bordered
                    dataSource={outputs}
                    renderItem={(item) => (<List.Item>{item}</List.Item>)} />

            </div>

        );
    }
}

export default TransactionDisplay;
