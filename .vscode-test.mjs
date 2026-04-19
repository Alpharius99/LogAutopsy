// .vscode-test.mjs — ESM module (not CJS)
import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/**/*.test.js',
  extensionDevelopmentPath: '.',
  mocha: {
    timeout: 20000,
  },
});
