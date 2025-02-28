import { decodeBase64Url } from "@std/encoding/base64url";
import { decodeVarint, decodeVarint32 } from "@std/encoding/varint";
import type { Header, StackTrace, Version } from "./stacktrace.ts";

function decodeEnumString(
  buf: Uint8Array,
  i: number,
  mapping: Record<number, string>,
): [string, number] {
  const discriminant = buf[i++];
  if (discriminant in mapping) {
    return [mapping[discriminant], i];
  }
  const size = discriminant;
  const bytes = buf.subarray(i, i + size);
  i += size;

  return [new TextDecoder().decode(bytes), i];
}

function decodeVersion(buf: Uint8Array, i: number): [Version, number] {
  let major: number,
    minor: number,
    patch: number,
    canaryHash: string | undefined,
    devBuild: boolean;
  [major, i] = decodeVarint32(buf, i);
  [minor, i] = decodeVarint32(buf, i);
  [patch, i] = decodeVarint32(buf, i);
  const discrim = buf[i++];
  if (discrim === 0) {
    canaryHash = undefined;
  } else {
    const bytes = buf.subarray(i, i + discrim);
    i += discrim;
    canaryHash = new TextDecoder().decode(bytes);
  }
  [devBuild, i] = decodeBool(buf, i);

  return [{
    major,
    minor,
    patch,
    devBuild,
    ...(canaryHash ? { canaryHash } : {}),
  }, i];
}

function decodeBool(buf: Uint8Array, i: number): [boolean, number] {
  const value = buf[i++];
  return [value === 1, i];
}

function decodeHeader(buf: Uint8Array, i: number): [Header, number] {
  const header: Partial<Header> = {};
  [header.traceVersion, i] = decodeVarint32(buf, i);
  [header.os, i] = decodeEnumString(buf, i, {
    0: "linux",
    1: "macos",
    2: "windows",
  });
  [header.arch, i] = decodeEnumString(buf, i, {
    0: "x86_64",
    1: "aarch64",
  });
  [header.version, i] = decodeVersion(buf, i);
  return [header as Header, i];
}

function decodeAddrArray(buf: Uint8Array, i: number): [BigUint64Array, number] {
  const out = [];
  while (i < buf.byteLength) {
    let decoded: bigint;
    [decoded, i] = decodeVarint(buf, i);
    out.push(decoded);
  }
  return [new BigUint64Array(out), i];
}

function decodeStackTrace(
  buf: Uint8Array,
  i: number = 0,
): [StackTrace, number] {
  const stackTrace: Partial<StackTrace> = {};
  [stackTrace.header, i] = decodeHeader(buf, i);
  [stackTrace.addrs, i] = decodeAddrArray(buf, i);
  return [stackTrace as StackTrace, i];
}

export function decodeStackTraceString(
  s: string,
): StackTrace {
  const buf = decodeBase64Url(s);
  const [stack, _] = decodeStackTrace(buf);
  return stack;
}
