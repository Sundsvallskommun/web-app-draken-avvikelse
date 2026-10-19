// Make Vitest's globals (describe/it/expect/vi/…) ambient for the whole project so
// test files can use them without importing. `types` in tsconfig.json can't reference
// `vitest/globals` here because an explicit `typeRoots` restricts `types` resolution to
// those roots; a `/// <reference>` from an included source file resolves it instead.
/// <reference types="vitest/globals" />
