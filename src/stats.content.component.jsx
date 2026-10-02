import React, { createElement } from 'react';

import { Button, Dropdown } from 'antd';
import { DownOutlined } from '@ant-design/icons';

import {
    LineChart, Line, CartesianGrid, XAxis, YAxis
} from 'recharts';

import jswallet from './jswallet';

// Each key is a timespan of jswallet.getPriceChart
const timespans = [
    { key: '30days', label: '30 days' },
    { key: '90days', label: '90 days' },
    { key: '1year', label: '1 year' },
];

class StatsContent extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            data: []
        };

        this.onTimespanSelect = this.onTimespanSelect.bind(this);
    }

    componentDidMount() {

        this.loadPriceData('90days');

    }

    loadPriceData(timespan) {

        jswallet.getPriceChart(timespan).then((results) => {
            const mapped = results.map((raw) => {

                const date = new Date(raw.time * 1000);
                const day = date.getDate();
                const month = date.getMonth() + 1;
                const year = date.getFullYear().toString().slice(-2);
                const formatted = day + '/' + month + '/' + year;
                return {
                    date: formatted,
                    price: Number((raw.price).toFixed(1)),
                };
            });
            this.setState({ data: mapped, });
        }).catch((e) => {
            console.log(e);
        });
    }

    onTimespanSelect({ key }) {
        this.loadPriceData(key);
    }

    render() {

        const { data } = this.state;

        return (
            <div>
                <div style={{ marginBottom: '18px' }}>
                    <Dropdown menu={{ items: timespans, onClick: this.onTimespanSelect }}>
                        <Button type="link" icon={<DownOutlined />} iconPlacement="end">
                            Time Period
                        </Button>
                    </Dropdown>
                </div>


                <LineChart
                    width={600}
                    height={300}
                    data={data}
                    margin={{
                        top: 5, right: 5, bottom: 5, left: 5
                    }}>
                    {/* recharts 1 reads its children's defaultProps from their elements. React 19's JSX no longer
                        puts them there, but createElement still does. Back to JSX with recharts 3 (jswallet-2cb.10). */}
                    {createElement(Line, { type: 'monotone', dataKey: 'price', stroke: '#8884d8' })}
                    {createElement(CartesianGrid, { stroke: '#ccc', strokeDasharray: '5 5' })}
                    {createElement(XAxis, { dataKey: 'date' })}
                    {createElement(YAxis)}
                </LineChart>
            </div>

        );
    }

}

export default StatsContent;
