// ESLint flat config。
// `next lint` は Next.js 15 で非推奨・16で削除予定なので、ESLint CLI を直接使う。
// （以前は npm run lint が対話プロンプトで固まっていた）

import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '*.tmp.mjs'] },
  ...compat.extends('next/core-web-vitals'),
  ...tseslint.configs.recommended,
  {
    rules: {
      // 外部APIレスポンスのパース直後のみ any を許容する方針なので、
      // 使われたら気づけるよう警告に留める（エラーで止めない）
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
]

export default config;
