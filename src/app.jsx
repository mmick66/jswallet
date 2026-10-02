import React, { lazy } from 'react';
import { Tabs, Layout } from 'antd';
import { CreditCardOutlined, LineChartOutlined, WalletOutlined } from '@ant-design/icons';
import TabContent from './tab.content.component';
import planetLogo from './images/planet.png';

// Lazy so that each tab loads its modules on its own (see TabContent).
const WalletsContent = lazy(() => import('./wallets.content.component'));
const StatsContent = lazy(() => import('./stats.content.component'));
const TransactionsContent = lazy(() => import('./payments.content.component.jsx'));

const { Header, Footer, Content } = Layout;

const tabs = [
    {
        key: '1',
        icon: <LineChartOutlined />,
        label: 'Price Charts',
        children: (
            <TabContent>
                <StatsContent />
            </TabContent>
        ),
    },
    {
        key: '2',
        icon: <WalletOutlined />,
        label: 'Wallets',
        children: (
            <TabContent>
                <WalletsContent />
            </TabContent>
        ),
    },
    {
        key: '3',
        icon: <CreditCardOutlined />,
        label: 'Payments',
        children: (
            <TabContent>
                <TransactionsContent />
            </TabContent>
        ),
    },
];

function App() {
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
                    <Tabs defaultActiveKey="2" style={{ padding: '16px' }} items={tabs} />
                </div>
            </Content>

            <Footer>
                Developed by Michael Michailidis / Designs by Vecteezy
            </Footer>
        </Layout>
    );
}

export default App;
