import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import App from './App';
import './index.css';

// Every API call carries this header; the backend rejects writes without it
// (CSRF protection), and a timeout keeps the UI from hanging on a dead server.
axios.defaults.headers.common['X-Requested-With'] = 'dashboard';
axios.defaults.timeout = 20000;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
