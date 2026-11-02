export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        navigator: 'readonly',
        crypto: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        performance: 'readonly',
        HTMLElement: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        // Service Worker globals
        self: 'readonly',
        caches: 'readonly',
        clients: 'readonly',
        Promise: 'readonly',
        // Custom globals
        DoxtehadCrypto: 'writable',
        DoxtehadStorage: 'writable',
        DoxtehadApp: 'writable'
      }
    },
    files: ['js/**/*.js'],
    ignores: ['node_modules/**', 'tests/**'],
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-console': 'off',
      'no-debugger': 'warn',
      'prefer-const': 'warn',
      'no-var': 'error',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'curly': 'off',
      'semi': ['error', 'always'],
      'quotes': ['warn', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'no-trailing-spaces': 'warn'
    }
  }
];