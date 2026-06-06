import { defineConfig, loadEnv } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

const root = process.cwd()

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, root)
  const isProduction = mode === 'production'
  
  return {
    main: {
      build: {
        outDir: 'dist/main',
        externalizeDeps: true,
        rollupOptions: {
          input: resolve(root, 'src/main/index.ts'),
        },
      },
      define: {
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      },
      resolve: {
        alias: {
          '@shared': resolve(root, 'src/shared'),
          '@main': resolve(root, 'src/main'),
        },
      },
    },
    preload: {
      build: {
        outDir: 'dist/preload',
        externalizeDeps: false,
        rollupOptions: {
          input: resolve(root, 'src/preload/index.ts'),
          output: {
            entryFileNames: 'index.mjs',
          },
        },
      },
      resolve: {
        alias: {
          '@shared': resolve(root, 'src/shared'),
        },
      },
    },
    renderer: {
      root: resolve(root, 'src/renderer'),
      build: {
        outDir: resolve(root, 'dist/renderer'),
      },
      plugins: [vue()],
      define: {
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      },
      resolve: {
        alias: {
          '@shared': resolve(root, 'src/shared'),
          '@renderer': resolve(root, 'src/renderer'),
        },
      },
    },
  }
})
