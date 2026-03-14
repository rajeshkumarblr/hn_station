import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isElectron = process.env.VITE_ELECTRON === 'true' || mode === 'electron';

  return {
    plugins: [
      react(),
      isElectron && electron([
        {
          entry: 'electron/main.ts',
          onstart(options) {
            options.startup()
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              emptyOutDir: false,
            },
          },
        },
      ]),
      isElectron && renderer(),
    ].filter(Boolean),
    build: {
      emptyOutDir: false,
    }
  }
})
