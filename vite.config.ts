import { defineConfig } from 'vite';

// どこに置いても動くように相対パスで出力する
export default defineConfig({
  base: './',
  server: { host: true },
});
