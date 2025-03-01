import {
  debugInfoToSymcache,
  Symbolicator,
} from "@nathanwhit/deno-symbolicate";
import type {
  Header,
  SymbolicatedStackTrace,
} from "@nathanwhit/deno-symbolicate/stacktrace";
import { decodeStackTraceString } from "@nathanwhit/deno-symbolicate/decode";
import { FileStorage } from "./storage.ts";

export const symcacheStorage = await FileStorage.open("symcaches");

function storageKey({ arch, os, version }: Header): string {
  return arch + "/" + os + "/" + version.major.toString() + "." +
    version.minor.toString + "." + version.patch +
    (version.canaryHash ? "-" + version.canaryHash : "");
}

const todo = (s?: string) => {
  throw new Error(`todo${s ? ": " + s : ""}`);
};

async function fetchDebugInfo(header: Header) {
  if (header.version.canaryHash) {
    todo();
  }
  const path =
    "/Users/nathanwhit/Documents/Code/Playgrounds/reconstruct-stacktrace" +
    storageKey(header).replaceAll("/", "__").replaceAll(".", "_") +
    ".debuginfo";

  const response = await fetch(new URL("file://" + path));
  const contents = await response.bytes();

  return contents;
}

// Mock function to simulate processing - replace this with actual implementation
export async function processStackTrace(
  encodedTrace: string,
  providedDebugInfo?: Uint8Array | null,
): Promise<SymbolicatedStackTrace> {
  console.log("decoding stack trace");
  const stack = decodeStackTraceString(encodedTrace);
  console.log("decoded string", stack);
  const key = storageKey(stack.header);

  console.log("getting symcache");
  let symcacheBlob = await symcacheStorage.getFile(key);

  if (!symcacheBlob) {
    console.log("no symcache, fetching");
    let debugInfo: Uint8Array;

    if (providedDebugInfo) {
      console.log("using provided debug info");
      // Use the provided debug info file
      debugInfo = providedDebugInfo;
    } else {
      console.log("fetching debug info");
      // Try to fetch debug info automatically
      debugInfo = await fetchDebugInfo(stack.header);
    }
    console.log("generating symcache");
    const sym = debugInfoToSymcache(debugInfo);
    console.log("symcache", sym);
    symcacheBlob = new Blob([sym]);
    console.log("writing to storage");
    await symcacheStorage.addFile(key, symcacheBlob);
  }
  console.log("got symcache");
  const symbolicator = new Symbolicator(
    new Uint8Array(await symcacheBlob.arrayBuffer()),
  );
  console.log("symbolicator");
  return symbolicator.symbolicate(stack);
}
