import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { BrowserRouter as Router } from 'react-router-dom'

console.log('[renderer] App Initializing...');

window.onerror = (message, source, lineno, colno, error) => {
  console.error('[renderer] Fatal Global Error:', message, { source, lineno, colno, error });
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)
