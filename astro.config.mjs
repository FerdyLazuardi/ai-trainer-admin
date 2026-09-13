import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  env: {
    schema: {
      BACKEND_API_URL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        default: 'https://ai-trainer.lifeatamartha.com/api/v1',
      }),
      ADMIN_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        default: '',
      }),
      SPREADSHEET_SYNC_URL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        default: 'https://script.google.com/macros/s/AKfycbwXqV2YPmdcU6PmHVqdEA3edLBd-ZSoYfvTE6cCEfgDszVIRD-rUH3mrNBWooN8MvhXOg/exec',
      }),
      SPREADSHEET_SYNC_TOKEN: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
        default: 'amartha_secret_kpi_token_2026',
      }),
    },
  },
  vite: {
    plugins: [tailwindcss()],
    server: {
      watch: {
        ignored: ['**/.astro/**', '**/.wrangler/**'],
      },
    },
    optimizeDeps: {
      exclude: ['@astrojs/cloudflare'],
    },
  },
});
