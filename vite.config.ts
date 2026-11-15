import { defineConfig } from "vite";

// three.js is large and changes rarely: its own chunk stays cached when only our code changes.
export default defineConfig({
  build: {
    // The physics chunk (Rapier's WebAssembly) is big on purpose and only loads the first time someone walks.
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // The WebGPU renderer (only used with ?webgpu) stays out of this chunk so it loads on demand
          if (id.includes("node_modules/three/") && !/three\.(webgpu|tsl)/.test(id)) return "three";
        },
      },
    },
  },
});
