import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        priority: {
          S: '#b91c1c',
          A: '#c2410c',
          B: '#a16207',
          C: '#4d7c0f',
          D: '#57534e',
        },
      },
    },
  },
  plugins: [],
};

export default config;
