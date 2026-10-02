import React from 'react';
import ReactDOM from 'react-dom';

import 'antd/dist/antd.css';
import './app.css';

import App from './app';

// The legacy root keeps antd 3 working on React 18; jswallet-2cb.9 moves to createRoot with React 19 and antd 6.
// eslint-disable-next-line react/no-deprecated
ReactDOM.render(<App />, document.getElementById('App'));
