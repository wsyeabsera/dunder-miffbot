import { defineConfig } from "vite";

// three.js is large and changes rarely: its own chunk stays cached when only our code changes.
export default defineConfig({
  build: {
    // The physics chunk (Rapier's WebAssembly) is big on purpose and only loads the first time someone walks.
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/")) return "three";
        },
      },
    },
  },
});
