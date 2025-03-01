import { useState } from "preact/hooks";
import * as zip from "@zip-js/zip-js";
import { processStackTrace, symcacheStorage } from "./stacktrace.ts";
import type { SymbolicatedStackTrace } from "@nathanwhit/deno-symbolicate";

export function App() {
  const [stackTrace, setStackTrace] = useState("");
  const [debugInfo, setDebugInfo] = useState<Blob | null>(null);
  const [symbolicatedStackTrace, setSymbolicatedStackTrace] =
    useState<SymbolicatedStackTrace | null>(null);
  return (
    <div class="container">
      <h1>Stack Trace Processor</h1>
      <div>
        <label for="input">Enter encoded stack trace:</label>
        <textarea
          id="input"
          placeholder="Paste your encoded stack trace here..."
          value={stackTrace}
          onChange={(e) => setStackTrace(e.currentTarget.value)}
        ></textarea>
      </div>
      <div>
        <label>
          <span>Debug Info</span>
          <input
            type="file"
            id="debug-info-file"
            accept=".zip"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              if (!file) {
                setDebugInfo(null);
                return;
              }
              const entries = await new zip.ZipReader(
                new zip.BlobReader(file)
              ).getEntries();
              let want = "";
              for (const entry of entries) {
                if (
                  entry.directory &&
                  entry.filename.toLowerCase().endsWith("dsym/")
                ) {
                  want = entry.filename + "Contents/Resources/DWARF/deno";
                } else if (!entry.directory && entries.length === 1) {
                  const getData = entry?.getData;
                  if (!getData) {
                    continue;
                  }
                  const blob = await getData(new zip.BlobWriter());
                  setDebugInfo(blob);
                  console.log(blob);
                  break;
                }
                if (entry.filename === want) {
                  const getData = entry?.getData;
                  if (!getData) {
                    continue;
                  }
                  const blob = await getData(new zip.BlobWriter());
                  setDebugInfo(blob);
                  console.log(blob);
                  break;
                }
              }
              console.log(entries);
            }}
          ></input>
        </label>
      </div>
      <button
        id="process-btn"
        type="button"
        onClick={async () =>
          await process(stackTrace, debugInfo, setSymbolicatedStackTrace)
        }
      >
        Process Stack Trace
      </button>
      <div id="output"></div>

      <ul id="file-list"></ul>

      <button
        id="clear-storage-btn"
        type="button"
        onClick={async () => {
          await symcacheStorage.clear();
        }}
      >
        Clear Storage
      </button>
      <SymbolicatedStackTrace trace={symbolicatedStackTrace} />
    </div>
  );
}

async function process(
  stackTrace: string,
  debugInfo: Blob | null,
  setSymbolicatedStackTrace: (st: SymbolicatedStackTrace) => void
) {
  stackTrace = stackTrace.trim();
  if (!stackTrace) {
    return;
  }
  console.log("getting bytes");
  const bytes = await debugInfo?.arrayBuffer();
  const uint8Array = bytes ? new Uint8Array(bytes) : null;
  const st = await processStackTrace(stackTrace, uint8Array);
  console.log(st);
  setSymbolicatedStackTrace(st);
}

function SymbolicatedStackTrace({
  trace,
}: {
  trace: SymbolicatedStackTrace | null;
}): preact.JSX.Element {
  if (!trace) {
    return <div>No trace</div>;
  }

  return (
    <div class="header">
      <strong>Version:</strong> {trace.header.traceVersion}
      <br />
      <strong>OS:</strong> {trace.header.os}
      <br />
      <strong>Architecture:</strong> {trace.header.arch}
      <br />
      <strong>Version:</strong> {trace.header.version.major}.
      {trace.header.version.minor}.{trace.header.version.patch}
      <div class="frames">
        {trace.frames.map((frame, index) => (
          <div>
            <div class="frame">
              <div class="frame-header">
                Frame #{index} at {frame.addr.toString(16)}
              </div>
            </div>
            <div class="frame-locations">
              {frame.locations.map((location) => (
                <div class="frame-location">
                  <div>{location.demangledName}</div>
                  <div>
                    {location.fullPath}:{location.line}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
