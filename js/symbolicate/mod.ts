import { create_symbol_cache, SymbolCache } from "symbolicate_wasm";

import type {
  FrameLocation,
  StackTrace,
  SymbolicatedFrame,
  SymbolicatedStackTrace,
} from "./stacktrace.ts";

export * from "./decode.ts";

export type * from "./stacktrace.ts";

export type EncodedSymCache = Uint8Array;

export class Symbolicator {
  symcache: SymbolCache;
  constructor(symCacheBytes: EncodedSymCache) {
    this.symcache = new SymbolCache(symCacheBytes);
  }

  symbolicateAddrs(addrs: BigUint64Array): SymbolicatedFrame[] {
    const result: FrameLocation[][] = this.symcache.lookup_addrs(addrs);
    const out: SymbolicatedFrame[] = [];
    for (let i = 0; i < result.length; i++) {
      out.push({
        addr: addrs[i],
        locations: result[i],
      });
    }
    return out;
  }

  symbolicate(stackTrace: StackTrace): SymbolicatedStackTrace {
    const frames = this.symbolicateAddrs(stackTrace.addrs);
    return {
      frames,
      header: stackTrace.header,
    };
  }
}

export function debugInfoToSymcache(debugInfo: Uint8Array): EncodedSymCache {
  return create_symbol_cache(debugInfo);
}
