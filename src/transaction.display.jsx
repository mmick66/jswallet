import React from 'react';
import { Listy } from 'antd';

// Listy needs a key per row, and two entries can read the same
const describe = (entries) => entries.map((entry, i) => ({ key: i, text: `${entry.address || '(no address)'} ${entry.value}` }));

const renderEntry = (entry) => entry.text;

class TransactionDisplay extends React.Component {

    constructor(props) {
        super(props);

        const transaction = props.content;

        console.log(transaction);

        if (transaction) {
            this.state = {
                hash: transaction.hash,
                inputs: describe(transaction.inputs),
                outputs: describe(transaction.outputs),
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
                <Listy items={inputs} rowKey="key" itemRender={renderEntry} />

                <h4>Outputs</h4>
                <Listy items={outputs} rowKey="key" itemRender={renderEntry} />

            </div>

        );
    }
}

export default TransactionDisplay;
