import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Configuration strings for error handling and fetch patching
const configScripts = {
  viteErrorHandler: `
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const addedNode of mutation.addedNodes) {
          if (
            addedNode.nodeType === Node.ELEMENT_NODE &&
            (
              addedNode.tagName?.toLowerCase() === 'vite-error-overlay' ||
              addedNode.classList?.contains('backdrop')
            )
          ) {
            handleViteOverlay(addedNode);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    function handleViteOverlay(node) {
      if (!node.shadowRoot) {
        return;
      }

      const backdrop = node.shadowRoot.querySelector('.backdrop');

      if (backdrop) {
        const overlayHtml = backdrop.outerHTML;
        const parser = new DOMParser();
        const doc = parser.parseFromString(overlayHtml, 'text/html');
        const messageBodyElement = doc.querySelector('.message-body');
        const fileElement = doc.querySelector('.file');
        const messageText = messageBodyElement ? messageBodyElement.textContent.trim() : '';
        const fileText = fileElement ? fileElement.textContent.trim() : '';
        const error = messageText + (fileText ? ' File:' + fileText : '');

        window.parent.postMessage({
          type: 'horizons-vite-error',
          error,
        }, '*');
      }
    }
  `,
  runtimeErrorHandler: `
    window.onerror = (message, source, lineno, colno, errorObj) => {
      window.parent.postMessage({
        type: 'horizons-runtime-error',
        message,
        source,
        lineno,
        colno,
        error: errorObj && errorObj.stack
      }, '*');
    };
  `,
  consoleErrorHandler: `
    const originalConsoleError = console.error;
    console.error = function(...args) {
      originalConsoleError.apply(console, args);

      const errorString = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ').toLowerCase();

      window.parent.postMessage({
        type: 'horizons-console-error',
        error: errorString
      }, '*');
    };
  `,
  fetchMonkeyPatch: `
    const originalFetch = window.fetch;

    window.fetch = async function(...args) {
      return originalFetch.apply(this, args)
        .then(async response => {
          if(!response.ok) {
            const errorFromRes = await response.text();
            console.error(errorFromRes);
          }

          return response;
        })
        .catch(error => {
          console.error(error);

          throw error;
        });
    };
  `,
};

// Custom plugin to inject scripts into index.html
const addTransformIndexHtml = {
  name: 'add-transform-index-html',
  transformIndexHtml(html) {
    return {
      html,
      tags: [
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: configScripts.runtimeErrorHandler,
          injectTo: 'head',
        },
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: configScripts.viteErrorHandler,
          injectTo: 'head',
        },
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: configScripts.consoleErrorHandler,
          injectTo: 'head',
        },
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: configScripts.fetchMonkeyPatch,
          injectTo: 'head',
        },
      ],
    };
  },
};

// Vite configuration
export default defineConfig({
  plugins: [react(), addTransformIndexHtml],
  server: {
    cors: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
    },
    allowedHosts: true,
  },
  resolve: {
    extensions: ['.jsx', '.js', '.tsx', '.ts', '.json'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
