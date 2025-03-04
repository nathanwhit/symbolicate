import { existsSync } from "jsr:@std/fs/exists";
import {
  decodeStackTraceString,
  Header,
  SymbolicatedStackTrace,
  Symbolicator,
} from "@nathanwhit/deno-symbolicate";
import { writeSymbolCacheFromDebugFile } from "@nathanwhit/deno-symbolicate/deno";

// deno-lint-ignore no-explicit-any
function toJSON(stack: SymbolicatedStackTrace): Record<string, any> {
  // deno-lint-ignore no-explicit-any
  const out: Record<string, any> = {};
  out.header = stack.header;
  out.frames = stack.frames.map((frame) => {
    return {
      ...frame,
      addr: "0x" + frame.addr.toString(16),
    };
  });
  return out;
}

const cache = new Map<string, Symbolicator>();

function cacheKey(header: Header): string {
  return header.arch + header.os + header.version.major.toString() +
    header.version.minor.toString() + header.version.patch.toString() +
    (header.version.canaryHash?.toString() ?? "");
}

function getSymbolicator(
  header: Header,
  debugInfo: string,
  symcache: string,
): Symbolicator {
  const key = cacheKey(header);
  if (cache.has(key)) {
    return cache.get(key)!;
  } else {
    if (!existsSync(symcache)) {
      writeSymbolCacheFromDebugFile(
        debugInfo,
        symcache,
      );
    }
    const contents = Deno.readFileSync(symcache);
    const symbolicator = new Symbolicator(contents);
    cache.set(key, symbolicator);
    return symbolicator;
  }
}

function getDebugInfo(_header: Header): string {
  throw new Error("todo");
}

Deno.serve(async (request) => {
  const encodedStackTrace = await request.text();
  const decoded = decodeStackTraceString(encodedStackTrace);
  const debugInfo = getDebugInfo(decoded.header);
  const symcache = "./debug-info.symcache";
  const symbolicator = getSymbolicator(decoded.header, debugInfo, symcache);
  const symbolicated = symbolicator.symbolicate(decoded);
  const response = Response.json(toJSON(symbolicated));
  return response;
});
