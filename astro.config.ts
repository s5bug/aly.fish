import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

import compress from "astro-compress";

// https://astro.build/config
export default defineConfig({
  adapter: cloudflare({
    // we handle this with compress()
    imageService: "passthrough"
  }),

  i18n: {
    locales: ["en", "ja"],
    defaultLocale: "en",
    routing: "manual"
  },

  site: "https://aly.fish",
  integrations: [
    compress({
      HTML: {
        "html-minifier-terser": {
          removeAttributeQuotes: false
        }
      },
      Exclude: [
        "88x31.svg"
      ]
    }),
  ],
});
