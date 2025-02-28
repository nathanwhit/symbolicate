export interface SymbolicatedFrame {
  addr: bigint;
  locations: FrameLocation[];
}

export interface SymbolicatedStackTrace {
  header: Header;
  frames: SymbolicatedFrame[];
}

export interface FrameLocation {
  demangledName: string;
  name: string;
  language: string;
  fullPath: string;
  line: number;
}

export type Os = string;
export type Arch = string;

export interface Version {
  major: number;
  minor: number;
  patch: number;
  canaryHash?: string;
  devBuild: boolean;
}
export interface Header {
  traceVersion: number;
  os: Os;
  version: Version;
  arch: Arch;
}

export interface StackTrace {
  header: Header;
  addrs: BigUint64Array;
}
