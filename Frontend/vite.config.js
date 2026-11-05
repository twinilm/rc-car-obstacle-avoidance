import { defineConfig } from 'vite'

// base: './' makes asset URLs relative so the built site works when
// deployed to a GitHub Pages project URL (https://<user>.github.io/<repo>/).
export default defineConfig({
  base: './',
})
