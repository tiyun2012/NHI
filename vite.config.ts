
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Critical Security:
    // If we are building for production, we MUST NOT bundle the API key.
    // We throw an error to alert the developer that they are attempting an insecure build.
    if (mode === 'production' && (env.API_KEY || env.GEMINI_API_KEY)) {
        throw new Error('Refusing to build: API key must not be bundled into client. Use a backend proxy for production.');
    }

    // Only inject the API key if we are explicitly in development mode.
    // In production, this will remain an empty string, ensuring no secrets leak.
    const apiKey = mode === 'development' ? (env.GEMINI_API_KEY || '') : '';

    return {
      base: './', // Ensure relative paths for assets
      server: {
        port: 3000,
        host: env.VITE_HOST || 'localhost',
        cors: true, // Enable CORS
      },
      plugins: [react()],
      define: {
        // Securely define the env variable.
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(apiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve('.'),
        }
      }
    };
});
