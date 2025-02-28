import {
  debugInfoToSymcache,
  type EncodedSymCache,
  Symbolicator,
} from "@nathanwhit/deno-symbolicate";
import {
  Header,
  StackTrace,
  SymbolicatedStackTrace,
} from "@nathanwhit/deno-symbolicate/stacktrace";
import { decodeStackTraceString } from "@nathanwhit/deno-symbolicate/decode";
import { FileStorage } from "./storage.ts";

const symcacheStorage = await FileStorage.open("symcaches");

async function processStackTrace(): Promise<void> {
  const input = document.getElementById("input") as HTMLTextAreaElement;
  const output = document.getElementById("output")!;

  if (!input.value.trim()) {
    output.innerHTML = '<div class="error">Please enter a stack trace</div>';
    return;
  }

  try {
    const processedTrace = await mockProcessStackTrace(input.value.trim());
    displayStackTrace(processedTrace);
  } catch (error) {
    output.innerHTML = `<div class="error">Error processing stack trace: ${
      (error as Error).stack
    }</div>`;
  }
}

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
async function mockProcessStackTrace(
  encodedTrace: string,
): Promise<SymbolicatedStackTrace> {
  const stack = decodeStackTraceString(encodedTrace);
  const key = storageKey(stack.header);
  let symcacheBlob = await symcacheStorage.getFile(key);
  if (!symcacheBlob) {
    const debugInfo = await fetchDebugInfo(stack.header);
    symcacheBlob = new Blob([debugInfoToSymcache(debugInfo)]);
    await symcacheStorage.addFile(key, symcacheBlob);
  }
  const symbolicator = new Symbolicator(await symcacheBlob.bytes());
  return symbolicator.symbolicate(stack);
}

function displayStackTrace(trace: SymbolicatedStackTrace): void {
  const output = document.getElementById("output")!;

  // Display header information
  let html = `<div class="header">
        <strong>Version:</strong> ${trace.header.traceVersion}<br>
        <strong>OS:</strong> ${trace.header.os}<br>
        <strong>Architecture:</strong> ${trace.header.arch}<br>
        <strong>Version:</strong> ${trace.header.version.major}.${trace.header.version.minor}.${trace.header.version.patch}
    </div>`;

  // Display frames
  html += '<div class="frames">';
  trace.frames.forEach((frame, index) => {
    html += `<div class="frame">
            <div class="frame-header">Frame #${index} at ${
      frame.addr.toString(16)
    }</div>`;

    frame.locations.forEach((location) => {
      html += `<div class="frame-location">
                <div>${location.demangledName}</div>
                <div class="frame-path">${location.fullPath}:<span class="frame-line">${location.line}</span></div>
            </div>`;
    });

    html += "</div>";
  });
  html += "</div>";

  output.innerHTML = html;
}

// Export the function to be used in the HTML
export { processStackTrace };
