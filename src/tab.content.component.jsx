import React, { Suspense } from 'react';
import { Alert, Spin } from 'antd';

// Each tab loads its modules on its own, so a tab that cannot load in the renderer
// (one that still imports Node built-ins or electron) leaves the layout and the other tabs working.
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
        const { children } = this.props;
        if (error) {
            return <Alert type="error" showIcon message="This tab could not be loaded" description={error.message} />;
        }
        return <Suspense fallback={<Spin />}>{children}</Suspense>;
    }
}

export default TabContent;
