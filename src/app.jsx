import React, { Suspense, lazy } from 'react';
import { Tabs, Icon, Layout, Alert, Spin } from 'antd';
import planetLogo from './images/planet.png';

// Each tab loads its modules on its own, so a tab that cannot load in the renderer
// (one that still imports Node built-ins or electron) leaves the layout and the other tabs working.
const WalletsContent = lazy(() => import('./wallets.content.component'));
const StatsContent = lazy(() => import('./stats.content.component'));
const TransactionsContent = lazy(() => import('./payments.content.component.jsx'));

const { Header, Footer, Content } = Layout;

class TabContent extends React.Component {

    static getDerivedStateFromError(error) {
        return { error };
    }

    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    render() {
        const { error } = this.state;
        if (error) {
            return <Alert type="error" showIcon message="This tab could not be loaded" description={error.message} />;
        }
        return <Suspense fallback={<Spin />}>{this.props.children}</Suspense>;
    }
}

class App extends React.Component {


    render() {
        return (
            <Layout>
                <Header className="Header">
                    <img style={{ marginTop: '10px', height: '40px', width: 'auto', float: 'left', marginRight: '18px' }}
                         src={planetLogo}
                         alt="Bitcoin Logo" />

                    <h3>JSWallet - Electron Wallet for Bitcoin</h3>
                </Header>
                <Content>
                    <div className="App">
                        <Tabs defaultActiveKey="2" style={{ padding: '16px' }}>
                            <Tabs.TabPane tab={<span><Icon type="line-chart" />Price Charts</span>} key="1">
                                <TabContent><StatsContent /></TabContent>
                            </Tabs.TabPane>
                            <Tabs.TabPane tab={<span><Icon type="wallet" />Wallets</span>} key="2">
                                <TabContent><WalletsContent /></TabContent>
                            </Tabs.TabPane>
                            <Tabs.TabPane tab={<span><Icon type="credit-card" />Payments</span>} key="3">
                                <TabContent><TransactionsContent /></TabContent>
                            </Tabs.TabPane>
                        </Tabs>
                    </div>
                </Content>

                <Footer>
                    Developed by Michael Michailidis / Designs by Vecteezy
                </Footer>
            </Layout>

        );
    }
}

export default App;
