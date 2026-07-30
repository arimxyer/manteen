import type { RegistrySourceObject } from "./types";

export const HOUSE_REGISTRY_ITEM_URL = "https://arimxyer.github.io/manteen/r/{name}.json";
export const HOUSE_REGISTRY_INDEX_URL = "https://arimxyer.github.io/manteen/r/registry.json";

/** A fresh project must be able to discover items, not only fetch a known ref. */
export function houseRegistrySource(): RegistrySourceObject {
  return {
    url: HOUSE_REGISTRY_ITEM_URL,
    index: HOUSE_REGISTRY_INDEX_URL,
  };
}
