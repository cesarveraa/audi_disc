import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './app/App';
import { initializeFirebaseApp } from '@infra/firebase/firebaseApp';
import './styles/global.css';

initializeFirebaseApp();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
