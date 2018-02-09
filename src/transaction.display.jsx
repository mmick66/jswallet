import React from 'react';


class TransactionDisplay extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            hash: '',
            inputs: [],
            outputs: [],

        };
    }

    render() {

        const inputColumns = [

            { title: 'Address', dataIndex: 'address', key: 'address' },
            { title: 'Bitcoins', dataIndex: 'coins', key: 'coins' },
        ];

        return (
            <div>
                <h3>{ this.state.hash }</h3>
                <h4>Inputs</h4>


            </div>

        );
    }
}

export default TransactionDisplay;
