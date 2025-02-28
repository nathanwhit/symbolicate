import { assertEquals } from "@std/assert";
import { encode_stack_trace } from "stacktrace_wasm";
import { decodeStackTraceString } from "../decode.ts";
import type { Header, StackTrace, Version } from "../stacktrace.ts";
import { decodeBase64Url } from "@std/encoding/base64url";

/**
 * Make a type assembled from several types/utilities more readable.
 * (e.g. the type will be shown as the final resulting type instead of as a bunch of type utils wrapping the initial type).
 */
type FinalType<T> = T extends infer U ? { [K in keyof U]: U[K] } : never;

/**
 * Merge keys of U into T, overriding value types with those in U.
 */
type Override<T, U extends Partial<Record<keyof T, unknown>>> = FinalType<
  Omit<T, keyof U> & U
>;

function encodeStackTrace(trace: StackTrace): string {
  return encode_stack_trace(trace);
}

function addrs(v: number[] | bigint[] | BigUint64Array) {
  if (v instanceof BigUint64Array) {
    return v;
  }
  return new BigUint64Array(v.map((v) => BigInt(v)));
}

function num(v: string): [number, string] {
  let i = 0;
  while (i < v.length && v[i] >= "0" && v[i] <= "9") {
    i++;
  }
  const major = Number(v.slice(0, i));
  const rest = v.slice(i);
  return [major, rest];
}

function eat(v: string, want: string): string {
  if (v.startsWith(want)) {
    return v.slice(want.length);
  }
  throw new Error(`Expected ${want} but got ${v}`);
}

function version(v: string): Version {
  let [major, rest] = num(v);
  rest = eat(rest, ".");
  let [minor, rest1] = num(rest);
  rest1 = eat(rest1, ".");
  let [patch, rest2] = num(rest1);

  let canaryHash;
  let devBuild = false;

  if (rest2.length > 0) {
    if (rest2.startsWith("-")) {
      rest2 = eat(rest2, "-");
      const [hash, dev] = rest2.split("+");
      canaryHash = hash;
      devBuild = dev === "dev";
    } else {
      if (rest2 === "+dev") {
        devBuild = true;
      } else {
        throw new Error(`Unknown version suffix ${rest2}`);
      }
    }
  }

  return {
    major,
    minor,
    patch,
    devBuild,
    ...(canaryHash ? { canaryHash } : {}),
  };
}

function header(v: Partial<Header>): Header {
  return {
    traceVersion: 1,
    os: "linux",
    version: version("1.0.0"),
    arch: "x86_64",
    ...v,
  };
}

type PartialStackTrace = Override<
  Partial<StackTrace>,
  { header: Partial<Header> }
>;

function stackTrace(v: PartialStackTrace): StackTrace {
  return {
    header: header(v.header ?? {}),
    addrs: addrs(v.addrs ?? [1, 2, 3]),
  };
}

function testRoundTrip(input: PartialStackTrace, debug = false): StackTrace {
  const st = stackTrace(input);
  if (debug) {
    console.log("Original input:", input);
    console.log("Expanded input:", st);
  }
  const encoded = encodeStackTrace(st);
  if (debug) {
    console.log("Encoded:", encoded);
    console.log("Decoded base64url:", decodeBase64Url(encoded));
  }
  const decoded = decodeStackTraceString(encoded);
  if (debug) {
    console.log("Decoded:", decoded);
  }
  assertEquals(decoded, st);
  return decoded;
}

testRoundTrip.debug = (input: Parameters<typeof testRoundTrip>[0]) => {
  return testRoundTrip(input, true);
};

Deno.test("decode basic", () => {
  testRoundTrip({
    addrs: addrs([1, 2, 3]),
    header: {
      traceVersion: 1,
      os: "linux",
      version: version("1.0.0"),
      arch: "x86_64",
    },
  });
});

Deno.test("decode with canary hash", () => {
  const result = testRoundTrip({
    header: {
      version: version("1.0.0-134f14feebabdb8ebf294130c9d073492d3eb1c6"),
    },
  });
  assertEquals(
    result.header.version.canaryHash,
    "134f14feebabdb8ebf294130c9d073492d3eb1c6",
  );
});

Deno.test("decode with dev build", () => {
  const result = testRoundTrip({
    header: {
      version: version("1.0.0+dev"),
    },
  });
  assertEquals(result.header.version.devBuild, true);
});

Deno.test("decode with dev build and canary hash", () => {
  const result = testRoundTrip({
    header: {
      version: version("1.0.0-134f14feebabdb8ebf294130c9d073492d3eb1c6+dev"),
    },
  });
  assertEquals(result.header.version.devBuild, true);
  assertEquals(
    result.header.version.canaryHash,
    "134f14feebabdb8ebf294130c9d073492d3eb1c6",
  );
});

Deno.test("decode other values", () => {
  testRoundTrip({
    header: {
      os: "otheros",
      arch: "otherarch",
    },
  });
});
