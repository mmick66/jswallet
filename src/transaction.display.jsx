import React from 'react';
import { Listy } from 'antd';

// Listy needs a key per row, and two entries can read the same
const describe = (entries) => entries.map((entry, i) => ({ key: i, text: `${entry.address || '(no address)'} ${entry.value}` }));

const renderEntry = (entry) => entry.text;

// Reads the transaction from props on every render: PaymentsContent keeps one instance in its Modal
// and passes it each payment the user selects.
function TransactionDisplay({ content }) {

    const hash = content ? content.hash : '';
    const inputs = content ? describe(content.inputs) : [];
    const outputs = content ? describe(content.outputs) : [];

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

export default TransactionDisplay;
