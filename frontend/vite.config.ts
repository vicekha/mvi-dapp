import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        include: ['recharts']
    },
    build: {
        commonjsOptions: {
            transformMixedEsModules: true,
        },
    },
    server: {
        port: 3001,
        strictPort: true,
        open: true
    }
})
