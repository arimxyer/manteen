export {
  type CompileResult,
  type FileRole,
  type Kind,
  type MantineItem,
  type MantineRegistry,
  type WireItem,
  FILE_TYPE,
  ITEM_TYPE,
  buildIndex,
  compileRegistry,
  createWireValidator,
  toWireItem,
  validateCatalog,
  writeRegistry,
} from "./build-registry";

export {
  type MergeConflict,
  type MergeOptions,
  type MergeResult,
  mergeThemeSource,
} from "./merge-theme";
