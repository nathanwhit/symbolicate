import { useState, useEffect } from "preact/hooks";
import * as zip from "@zip-js/zip-js";
import { processStackTrace, symcacheStorage } from "./stacktrace.ts";
import type { SymbolicatedStackTrace } from "@nathanwhit/deno-symbolicate";

export function App() {
  const location = globalThis.location.pathname;
  const initStack = location.trim().slice(location.lastIndexOf("/") + 1);
  const [stackTrace, setStackTrace] = useState(initStack);
  const [debugInfo, setDebugInfo] = useState<Blob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [symbolicatedStackTrace, setSymbolicatedStackTrace] =
    useState<SymbolicatedStackTrace | null>(null);

  // Initialize dark mode from system preference
  useEffect(() => {
    const prefersDark = globalThis.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    setDarkMode(prefersDark);
  }, []);

  const setDarkMode = (dark: boolean) => {
    setIsDarkMode(dark);
    if (dark) {
      document.documentElement.classList.add("dark");
      document.querySelector("html")?.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.querySelector("html")?.setAttribute("data-theme", "light");
    }
  };
  // Toggle dark mode
  const toggleDarkMode = () => {
    setDarkMode(!isDarkMode);
  };

  // Clear notification after 3 seconds
  const showNotification = (message: string, type: "success" | "error") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleFileChange = async (e: Event) => {
    const target = e.currentTarget as HTMLInputElement;
    const file = target.files?.[0];

    if (!file) {
      setDebugInfo(null);
      return;
    }

    await processFile(file);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      await processFile(file);
    }
  };

  const processFile = async (file: File) => {
    setIsLoading(true);
    setLoadingMessage(`Preparing to read ${formatFileSize(file.size)}...`);
    setLoadingProgress(0);

    try {
      // For zip files, extract the debug info
      if (file.name.endsWith(".zip")) {
        setLoadingMessage(`Extracting debug info from zip...`);
        const entries = await new zip.ZipReader(
          new zip.BlobReader(file)
        ).getEntries();

        let want = "";
        for (const entry of entries) {
          setLoadingProgress((entries.indexOf(entry) / entries.length) * 50);

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
            setLoadingMessage(`Extracting file from zip...`);
            const blob = await getData(new zip.BlobWriter());
            setDebugInfo(blob);
            setLoadingProgress(100);
            setIsLoading(false);
            showNotification("Debug info extracted successfully", "success");
            break;
          }

          if (entry.filename === want) {
            const getData = entry?.getData;
            if (!getData) {
              continue;
            }
            setLoadingMessage(`Extracting debug symbols...`);
            const blob = await getData(new zip.BlobWriter());
            setDebugInfo(blob);
            setLoadingProgress(100);
            setIsLoading(false);
            showNotification("Debug symbols extracted successfully", "success");
            break;
          }
        }
      } else {
        // For regular files, read directly
        setLoadingMessage(`Reading ${formatFileSize(file.size)}...`);

        // Simulate progress for better UX
        const progressInterval = setInterval(() => {
          setLoadingProgress((prev) => Math.min(prev + 5, 90));
        }, 100);

        const reader = new FileReader();
        reader.onload = () => {
          clearInterval(progressInterval);
          const arrayBuffer = reader.result as ArrayBuffer;
          setDebugInfo(new Blob([arrayBuffer]));
          setLoadingProgress(100);
          setLoadingMessage("File loaded successfully");
          setTimeout(() => {
            setIsLoading(false);
            showNotification("File loaded successfully", "success");
          }, 500);
        };

        reader.onerror = () => {
          clearInterval(progressInterval);
          setLoadingMessage("Error loading file");
          setIsLoading(false);
          showNotification("Error loading file", "error");
        };

        reader.readAsArrayBuffer(file);
      }
    } catch (error) {
      setLoadingMessage(`Error: ${(error as Error).message}`);
      setIsLoading(false);
      showNotification(`Error: ${(error as Error).message}`, "error");
    }
  };

  const handleProcess = async () => {
    if (!stackTrace.trim()) return;

    setIsLoading(true);
    setLoadingMessage("Processing stack trace...");
    setLoadingProgress(30);

    try {
      const bytes = await debugInfo?.arrayBuffer();
      const uint8Array = bytes ? new Uint8Array(bytes) : null;

      setLoadingProgress(50);
      const st = await processStackTrace(stackTrace.trim(), uint8Array);

      setLoadingProgress(90);
      setSymbolicatedStackTrace(st);
      setLoadingProgress(100);
      setLoadingMessage("Processing complete");
      setTimeout(() => {
        setIsLoading(false);
        showNotification("Stack trace processed successfully", "success");
      }, 500);
    } catch (error) {
      setLoadingMessage(`Error: ${(error as Error).message}`);
      setIsLoading(false);
      showNotification(`Error: ${(error as Error).message}`, "error");
    }
  };

  return (
    <div
      className={`min-h-screen py-8 ${
        isDarkMode ? "dark bg-gray-900" : "bg-gray-50"
      }`}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {notification && (
          <div
            className={`fixed top-4 right-4 px-4 py-3 rounded-md shadow-lg ${
              notification.type === "success"
                ? "bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-100"
                : "bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-100"
            } transition-opacity duration-300 flex items-center z-50`}
          >
            <div
              className={`w-2 h-2 rounded-full mr-2 ${
                notification.type === "success" ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            {notification.message}
          </div>
        )}

        <div className="flex justify-between items-center mb-8">
          <div className="text-center flex-1">
            <h1
              className={`text-3xl font-bold sm:text-4xl ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              Stack Trace Symbolication
            </h1>
            <p
              className={`mt-3 text-lg ${
                isDarkMode ? "text-gray-300" : "text-gray-500"
              }`}
            >
              Decode and symbolicate Deno stack traces
            </p>
          </div>
          <button
            type = "button"
            onClick={toggleDarkMode}
            className="p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            aria-label="Toggle dark mode"
          >
            {isDarkMode ? (
              <svg
                className="w-6 h-6 text-yellow-300"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                className="w-6 h-6 text-gray-700"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
        </div>

        <div
          className={`shadow-lg rounded-lg overflow-hidden ${
            isDarkMode ? "bg-gray-800" : "bg-white"
          } bg-base-content`}
        >
          <div className="p-6">
            <div className="mb-6">
              <label
                htmlFor="input"
                className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? "text-gray-200" : "text-gray-700"
                }`}
              >
                Enter encoded stack trace:
              </label>
              <textarea
                id="input"
                className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 h-32 ${
                  isDarkMode
                    ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                    : "border-gray-300 text-gray-900 placeholder-gray-400"
                }`}
                placeholder="Paste your encoded stack trace here..."
                value={stackTrace}
                onChange={(e) => setStackTrace(e.currentTarget.value)}
              ></textarea>
            </div>

            <div className="mb-6">
              <label
                className={`block text-sm font-medium mb-2 ${
                  isDarkMode ? "text-gray-200" : "text-gray-700"
                }`}
              >
                Debug Info File (Optional):
              </label>
              <div
                className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors ${
                  isDragging
                    ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20"
                    : isDarkMode
                    ? "border-gray-600 hover:border-gray-500"
                    : "border-gray-300 hover:border-gray-400"
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={handleDrop}
              >
                <div className="space-y-1 text-center">
                  <svg
                    className={`mx-auto h-12 w-12 ${
                      isDarkMode ? "text-gray-400" : "text-gray-400"
                    }`}
                    stroke="currentColor"
                    fill="none"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <div
                    className={`flex text-sm ${
                      isDarkMode ? "text-gray-300" : "text-gray-600"
                    }`}
                  >
                    <label
                      htmlFor="debug-info-file"
                      className={`relative cursor-pointer rounded-md font-medium focus-within:outline-none ${
                        isDarkMode
                          ? "text-indigo-400 hover:text-indigo-300"
                          : "text-indigo-600 hover:text-indigo-500"
                      }`}
                    >
                      <span>Upload a file</span>
                      <input
                        id="debug-info-file"
                        type="file"
                        className="sr-only"
                        accept=".zip,.debuginfo,application/octet-stream"
                        onChange={handleFileChange}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p
                    className={`text-xs ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    ZIP, debug info, or binary file
                  </p>
                  {debugInfo && (
                    <p
                      className={`text-sm font-medium ${
                        isDarkMode ? "text-green-400" : "text-green-600"
                      }`}
                    >
                      ✓ File loaded successfully
                    </p>
                  )}
                </div>
              </div>
            </div>

            {isLoading && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center">
                    <div
                      className={`mr-2 animate-spin rounded-full h-4 w-4 border-b-2 ${
                        isDarkMode ? "border-indigo-400" : "border-indigo-500"
                      }`}
                    ></div>
                    <span
                      className={`text-sm font-medium ${
                        isDarkMode ? "text-gray-300" : "text-gray-700"
                      }`}
                    >
                      {loadingMessage}
                    </span>
                  </div>
                  <span
                    className={`text-xs font-semibold ${
                      isDarkMode ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {loadingProgress}%
                  </span>
                </div>
                <div
                  className={`w-full rounded-full h-2.5 ${
                    isDarkMode ? "bg-gray-700" : "bg-gray-200"
                  }`}
                >
                  <div
                    className={`h-2.5 rounded-full relative overflow-hidden transition-all duration-300 ${
                      isDarkMode ? "bg-indigo-500" : "bg-indigo-600"
                    }`}
                    style={{ width: `${loadingProgress}%` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleProcess}
                disabled={isLoading || !stackTrace.trim()}
              >
                Process Stack Trace
              </button>

              <button
                type="button"
                // className={`inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                //   isDarkMode
                //     ? "border-gray-600 text-gray-200 bg-red-700 hover:bg-red-800 focus:ring-offset-gray-800"
                //     : "border-gray-300 text-white bg-red-700 hover:bg-red-800"
                // }`}
                className="btn btn-error"
                onClick={async () => {
                  await symcacheStorage.clear();
                  showNotification("Cache cleared successfully", "success");
                }}
              >
                Clear Cache
              </button>
            </div>
          </div>
        </div>

        {symbolicatedStackTrace && (
          <div
            className={`mt-8 shadow-lg rounded-lg overflow-hidden ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            <div
              className={`border-b px-6 py-4 ${
                isDarkMode ? "border-gray-700" : "border-gray-200"
              }`}
            >
              <h2
                className={`text-lg font-medium ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                Symbolicated Stack Trace
              </h2>
            </div>
            <div className="px-6 py-4">
              <SymbolicatedStackTrace
                trace={symbolicatedStackTrace}
                isDarkMode={isDarkMode}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SymbolicatedStackTrace({
  trace,
  isDarkMode,
}: {
  trace: SymbolicatedStackTrace | null;
  isDarkMode: boolean;
}): preact.JSX.Element {
  if (!trace) {
    return (
      <div
        className={`text-center py-4 ${
          isDarkMode ? "text-gray-400" : "text-gray-500"
        }`}
      >
        No trace available
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        <div
          className={`rounded-md p-3 ${
            isDarkMode ? "bg-gray-700" : "bg-gray-50"
          }`}
        >
          <span
            className={`font-medium ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            OS:
          </span>{" "}
          <span className={isDarkMode ? "text-white" : "text-gray-900"}>
            {trace.header.os}
          </span>
        </div>
        <div
          className={`rounded-md p-3 ${
            isDarkMode ? "bg-gray-700" : "bg-gray-50"
          }`}
        >
          <span
            className={`font-medium ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            Architecture:
          </span>{" "}
          <span className={isDarkMode ? "text-white" : "text-gray-900"}>
            {trace.header.arch}
          </span>
        </div>
        <div
          className={`rounded-md p-3 ${
            isDarkMode ? "bg-gray-700" : "bg-gray-50"
          }`}
        >
          <span
            className={`font-medium ${
              isDarkMode ? "text-gray-400" : "text-gray-500"
            }`}
          >
            Deno Version:
          </span>{" "}
          <span className={isDarkMode ? "text-white" : "text-gray-900"}>
            {trace.header.version.major}.{trace.header.version.minor}.
            {trace.header.version.patch}
            {trace.header.version.canaryHash &&
              `-${trace.header.version.canaryHash}`}
            {trace.header.version.devBuild && " (dev build)"}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {trace.frames.map((frame, index) => (
          <div
            key={index}
            className={`border rounded-md overflow-hidden ${
              isDarkMode ? "border-gray-700" : "border-gray-200"
            }`}
          >
            <div
              className={`px-4 py-2 text-sm font-medium ${
                isDarkMode
                  ? "bg-gray-700 text-gray-200"
                  : "bg-gray-50 text-gray-700"
              }`}
            >
              Frame #{index} at 0x{frame.addr.toString(16)}
            </div>
            <div
              className={`divide-y ${
                isDarkMode ? "divide-gray-700" : "divide-gray-200"
              }`}
            >
              {frame.locations.map((location, locIndex) => (
                <div key={locIndex} className="px-4 py-3">
                  <div
                    className={`font-mono text-sm mb-1 ${
                      isDarkMode ? "text-indigo-400" : "text-indigo-600"
                    }`}
                  >
                    {location.demangledName}
                  </div>
                  <div className="flex items-center text-xs">
                    <svg
                      className={`h-4 w-4 mr-1 ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                      />
                    </svg>
                    <span
                      className={`font-mono ${
                        isDarkMode ? "text-gray-400" : "text-gray-500"
                      }`}
                    >
                      {location.fullPath}:
                      <span
                        className={`font-medium ${
                          isDarkMode ? "text-gray-200" : "text-gray-900"
                        }`}
                      >
                        {location.line}
                      </span>
                    </span>
                  </div>
                </div>
              ))}
              {frame.locations.length === 0 && (
                <div
                  className={`px-4 py-3 text-sm italic ${
                    isDarkMode ? "text-gray-400" : "text-gray-500"
                  }`}
                >
                  No location information available
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return bytes + " bytes";
  } else if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  } else if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  } else {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }
}
