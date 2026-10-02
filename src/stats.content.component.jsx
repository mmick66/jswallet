import React from 'react';

import { Menu, Dropdown, Icon } from 'antd';

import {
    LineChart, Line, CartesianGrid, XAxis, YAxis
} from 'recharts';

import jswallet from './jswallet';

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
        let tspan = '';
        switch (key) {
        case '1':
            tspan = '30days';
            break;
        case '2':
            tspan = '90days';
            break;
        case '3':
            tspan = '1year';
            break;
        default: break;
        }
        this.loadPriceData(tspan);
    }

    render() {

        const { data } = this.state;

        const timespan = (
            <Menu onClick={this.onTimespanSelect}>
                <Menu.Item key="1">30 days</Menu.Item>
                <Menu.Item key="2">90 days</Menu.Item>
                <Menu.Item key="3">1 year</Menu.Item>
            </Menu>
        );
        return (
            <div>
                <div style={{ marginBottom: '18px' }}>
                    <Dropdown overlay={timespan}>
                        <a className="ant-dropdown-link">
                            {'Time Period '}
                            <Icon type="down" />
                        </a>
                    </Dropdown>
                </div>


                <LineChart
                    width={600}
                    height={300}
                    data={data}
                    margin={{
                        top: 5, right: 5, bottom: 5, left: 5
                    }}>
                    <Line type="monotone" dataKey="price" stroke="#8884d8" />
                    <CartesianGrid stroke="#ccc" strokeDasharray="5 5" />
                    <XAxis dataKey="date" />
                    <YAxis />
                </LineChart>
            </div>

        );
    }

}

export default StatsContent;
