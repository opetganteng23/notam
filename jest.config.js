module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testTimeout: 60000,
  globals: { 'ts-jest': { tsconfig: { rootDir: '.', experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true, strictPropertyInitialization: false } } },
};
