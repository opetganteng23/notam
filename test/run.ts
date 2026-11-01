import { run } from 'node:test';
import { spec } from 'node:test/reporters';
import path from 'node:path';

// Jest tidak dipakai di sini: driver MongoDB gagal handshake di sandbox Jest.
process.env.MONGOMS_VERSION ??= '8.2.6';
process.env.TS_NODE_COMPILER_OPTIONS ??= JSON.stringify({
  module: 'commonjs', rootDir: '.', esModuleInterop: true, experimentalDecorators: true, emitDecoratorMetadata: true,
});

run({ files: [path.resolve(__dirname, 'workflow.e2e.ts')], concurrency: false, execArgv: ['-r', 'ts-node/register/transpile-only'] })
  .on('test:fail', () => (process.exitCode = 1))
  .compose(spec)
  .pipe(process.stdout);
