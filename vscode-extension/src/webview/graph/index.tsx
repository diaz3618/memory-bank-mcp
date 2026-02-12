/**
 * Webview Entry Point
 * Initializes the React application in the VS Code webview context
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { KnowledgeGraph } from './KnowledgeGraph';
import './styles.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <KnowledgeGraph />
  </React.StrictMode>
);
