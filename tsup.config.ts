import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'queue/index': 'src/queue/index.ts',
        'cache/index': 'src/cache/index.ts',
        'storage/index': 'src/storage/index.ts',
        'events/index': 'src/events/index.ts',
        'rate-limit/index': 'src/rate-limit/index.ts',
        'lock/index': 'src/lock/index.ts',
        'session/index': 'src/session/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['bullmq', 'ioredis', 'minio'],
});
