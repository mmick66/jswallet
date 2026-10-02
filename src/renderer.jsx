import React from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp } from 'antd';

import 'antd/dist/reset.css';
import './app.css';

import App from './app';

// antd's App provides the message and modal hooks (App.useApp) with the theme's context.
createRoot(document.getElementById('App')).render(
    <AntApp>
        <App />
    </AntApp>
);
