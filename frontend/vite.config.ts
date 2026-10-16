import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        fs: {
            strict: true,
            allow: [fileURLToPath(new URL('.', import.meta.url))],
        },
    },
});
