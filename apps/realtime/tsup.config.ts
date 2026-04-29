import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle workspace packages so the deployed image doesn't need to resolve
  // them at runtime; keep heavy native/binary deps external.
  noExternal: [/@openliveslide\/.*/],
  external: ['@prisma/client', '.prisma/client'],
});
