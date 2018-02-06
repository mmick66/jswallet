import React from 'react';
import { Tabs, Icon, Layout } from 'antd';
import WalletsContent from './wallets.content.component';
import StatsContent from './stats.content.component';

const { Header, Footer, Content } = Layout;

class App extends React.Component {


    render() {
        return (
            <Layout>
                <Header className="Header">
                    <h3>Electron JS Wallet for Bitcoin</h3>
                </Header>
                <Content>
                    <div className="App">
                        <Tabs defaultActiveKey="1" style={{ padding: '16px' }}>
                            <Tabs.TabPane tab={<span><Icon type="wallet" />Wallets</span>} key="1">
                                <WalletsContent />
                            </Tabs.TabPane>
                            <Tabs.TabPane tab={<span><Icon type="solution" />Transactions</span>} key="2">
                                Content of Tab Pane 2
                            </Tabs.TabPane>
                            <Tabs.TabPane tab={<span><Icon type="area-chart" />Stats</span>}key="3">
                                <StatsContent />
                            </Tabs.TabPane>
                        </Tabs>
                    </div>
                </Content>

                <Footer>
                    Developed as an experiment by Michael Michailidis
                </Footer>
            </Layout>

        );
    }
}

export default App;
