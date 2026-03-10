import { defineConfig } from 'vite';

export default defineConfig({
  // Diretório raiz do projeto
  root: '.',
  
  // Não usar publicDir para evitar conflitos com a estrutura atual
  publicDir: 'public',
  
  // Configuração do servidor de desenvolvimento
  server: {
    port: 5173,
    open: true,
    cors: true,
  },
  
  // Configuração de build
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  
  // Aliases para imports
  resolve: {
    alias: {
      '@': '/assets',
      '@css': '/assets/css',
      '@js': '/assets/js',
      '@img': '/assets/img',
    },
  },
});
