import React, { lazy } from 'react';
import { Tabs, Icon, Layout } from 'antd';
import TabContent from './tab.content.component';
import planetLogo from './images/planet.png';

// Lazy so that each tab loads its modules on its own (see TabContent).
const WalletsContent = lazy(() => import('./wallets.content.component'));
const StatsContent = lazy(() => import('./stats.content.component'));
const TransactionsContent = lazy(() => import('./payments.content.component.jsx'));

const { Header, Footer, Content } = Layout;

class App extends React.Component {


    render() {
        return (
            <Layout>
                <Header className="Header">
                    <img style={{
                        marginTop: '10px', height: '40px', width: 'auto', float: 'left', marginRight: '18px'
                    }}
                         src={planetLogo}
                         alt="Bitcoin Logo" />

                    <h3>JSWallet - Electron Wallet for Bitcoin</h3>
                </Header>
                <Content>
                    <div className="App">
                        <Tabs defaultActiveKey="2" style={{ padding: '16px' }}>
                            <Tabs.TabPane
                                tab={(
                                    <span>
                                        <Icon type="line-chart" />
                                        Price Charts
                                    </span>
                                )}
                                key="1">
                                <TabContent>
                                    <StatsContent />
                                </TabContent>
                            </Tabs.TabPane>
                            <Tabs.TabPane
                                tab={(
                                    <span>
                                        <Icon type="wallet" />
                                        Wallets
                                    </span>
                                )}
                                key="2">
                                <TabContent>
                                    <WalletsContent />
                                </TabContent>
                            </Tabs.TabPane>
                            <Tabs.TabPane
                                tab={(
                                    <span>
                                        <Icon type="credit-card" />
                                        Payments
                                    </span>
                                )}
                                key="3">
                                <TabContent>
                                    <TransactionsContent />
                                </TabContent>
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
