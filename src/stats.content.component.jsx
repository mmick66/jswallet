import React from 'react';

import { LineChart, Line, CartesianGrid, XAxis, YAxis } from 'recharts';
import { statistics } from 'blockchain.info';

class StatsContent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            data: []
        };
    }

    componentDidMount() {
        statistics.getChartData('market-price', { timespan: '90d' }).then((r) => {
            this.setState({
               data: r,
            });
        }).catch((e) => {
            console.log(e);
        });
    }

    render() {
        return (
            <LineChart width={600} height={300} data={this.state.data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <Line type="monotone" dataKey="uv" stroke="#8884d8" />
                <CartesianGrid stroke="#ccc" strokeDasharray="5 5" />
                <XAxis dataKey="name" />
                <YAxis />
            </LineChart>
        );
    }

}

export default StatsContent;
