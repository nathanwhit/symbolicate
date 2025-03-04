# Deno Symbolication

Tools for collecting and symbolicating stack traces from binaries without debug
info.

## Components

### crates/deno_stable_stacktrace

Provides the code for
[collecting the stack trace](crates/deno_stable_stacktrace/src/lib.rs). It uses
the stack walking from the `backtrace` crate, and adjusts the stackframe frame
addresses for where the binary has been loaded into memory.

Also provides [encoding](crates/deno_stable_stacktrace/src/encode.rs) for the
stack trace + a header with information about the host system, allowing you to
make a base64url string that contains everything needed to symbolicate the stack
trace later.

### crates/deno_symbolicate

A small interface over the `symbolic` crates to symbolicate addresses into stack
frame locations.

### crates/deno_symbolicate_wasm

A wasm interface for `deno_symbolicate`

### crates/deno_stacktrace_encoding_wasm

A wasm interface for the encoding part of `deno_stable_stacktrace`. Currently
used to test the JS decoding implementation.

### js/symbolicate

Javascript library to decode and symbolicate encoded stack traces. Uses
`deno_symbolicate_wasm` for the symbolication logic. Written so that it can be
used from deno or the web.

To run this, first you need to build the wasm bindings via
`deno task wasmbuild`.

### js/client-side

A small PoC website that does symbolication completely client-side via wasm.
Execute `deno i && deno task dev` to try it.
