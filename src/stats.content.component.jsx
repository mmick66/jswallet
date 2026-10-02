import React from 'react';

import { Button, Dropdown } from 'antd';
import { DownOutlined } from '@ant-design/icons';

import {
    LineChart, Line, CartesianGrid, XAxis, YAxis, useXAxisTicks, useYAxisTicks
} from 'recharts';

import jswallet from './jswallet';

// Each key is a timespan of jswallet.getPriceChart
const timespans = [
    { key: '30days', label: '30 days' },
    { key: '90days', label: '90 days' },
    { key: '1year', label: '1 year' },
];

// CartesianGrid picks its own ticks, measuring their labels in the page's font size rather than the axes'
// (antd's 14px), so its lines can miss the labels the axes show. Draw them at the axes' rendered ticks.
function PriceGrid() {
    const coordinates = (ticks) => ticks?.map((tick) => tick.coordinate);
    return (
        <CartesianGrid
            stroke="#ccc"
            strokeDasharray="5 5"
            verticalPoints={coordinates(useXAxisTicks())}
            horizontalPoints={coordinates(useYAxisTicks())} />
    );
}

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
                    responsive
                    style={{ width: '100%', height: 300 }}
                    data={data}
                    margin={{
                        top: 5, right: 5, bottom: 5, left: 5
                    }}>
                    <Line type="monotone" dataKey="price" stroke="#8884d8" />
                    <PriceGrid />
                    <XAxis dataKey="date" />
                    <YAxis />
                </LineChart>
            </div>

        );
    }

}

export default StatsContent;
