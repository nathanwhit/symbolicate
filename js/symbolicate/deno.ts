import pathMod from "node:path";
import { create_symbol_cache } from "symbolicate_wasm";

export function resolveDsym(path: string): string | undefined {
  const stat = Deno.statSync(path);
  if (!path.endsWith("dSYM") || !stat.isDirectory) {
    return;
  }

  const pathParsed = pathMod.parse(path);
  const framework = pathParsed.name;
  const fullPath = pathMod.join(path, "Contents/Resources/DWARF", framework);
  if (Deno.statSync(fullPath).isFile) {
    return fullPath;
  } else {
    return undefined;
  }
}

export function writeSymbolCacheFromDebugFile(
  debugFilePath: string,
  outPath?: string,
) {
  const contents = Deno.readFileSync(
    resolveDsym(debugFilePath) ?? debugFilePath,
  );
  const out = create_symbol_cache(contents);
  outPath = outPath ?? debugFilePath + ".symcache";
  Deno.writeFileSync(outPath, out);
}
