import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import { registerSW } from 'virtual:pwa-register'
import './index.css'

registerSW({ immediate: true })

const originalWarn = console.warn;
const originalError = console.error;

console.warn = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('defaultProps will be removed') || msg.includes('Warning: ') || msg.includes('NotAllowedError') || msg.includes('no-speech') || msg.includes('Speech Recognition Error')) return;
  originalWarn(...args);
};

console.error = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('defaultProps will be removed') || msg.includes('Warning: ') || msg.includes('NotAllowedError') || msg.includes('findDOMNode is deprecated')) return;
  originalError(...args);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)
