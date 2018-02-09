import React from 'react';
import { List } from 'antd';

class TransactionDisplay extends React.Component {

    constructor(props) {
        super(props);

        const transaction = props.content;

        console.log(transaction);

        if (transaction) {
            this.state = {
                hash: transaction.hash,
                inputs: transaction.inputs.filter(i => i.prev_out).map(po => `${po.addr} ${po.value}`),
                outputs: transaction.out.map(o => `${o.addr} ${o.value}`),
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


        return (
            <div>
                <h3>{ this.state.hash }</h3>

                <h4>Inputs</h4>
                <List
                    size="small"
                    header={<div>Header</div>}
                    footer={<div>Footer</div>}
                    bordered
                    dataSource={this.state.inputs}
                    renderItem={item => (<List.Item>{item}</List.Item>)} />

                <h4>Outputs</h4>
                <List
                    size="small"
                    header={<div>Header</div>}
                    footer={<div>Footer</div>}
                    bordered
                    dataSource={this.state.outputs}
                    renderItem={item => (<List.Item>{item}</List.Item>)} />

            </div>

        );
    }
}

export default TransactionDisplay;
