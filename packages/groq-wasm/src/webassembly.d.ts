/**
 * `WebAssembly` is declared in TypeScript's DOM lib. This package targets
 * ES2022, so declare the compiled-module constructor the lazy entry accepts
 * without pulling DOM types into the project.
 */
declare namespace WebAssembly {
  // Ambient constructor. The host provides the runtime class; this declaration
  // only names the type `initWasm` accepts.
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class Module {
    constructor(bytes: ArrayBuffer | Uint8Array)
  }
}
