fn varint_encoded_size(mut v: u64) -> usize {
  if v == 0 {
    return 1;
  }

  let mut logcounter = 0;
  while v > 0 {
    logcounter += 1;
    v >>= 7;
  }
  logcounter
}

fn varint_encode_into(buf: &mut [u8], value: u64) -> usize {
  let mut value = value;
  let mut i = 0;
  while value >= 0x80 {
    buf[i] = 0x80 | (value as u8);
    i += 1;
    value >>= 7;
  }
  buf[i] = value as u8;
  i + 1
}

const BASE64URL_CHARS: &[u8] =
  b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

fn base64url_encode(input: &[u8]) -> String {
  let mut result = String::with_capacity((input.len() + 2) / 3 * 4);
  let mut i = 0;

  while i + 3 <= input.len() {
    let chunk = ((input[i] as u32) << 16)
      | ((input[i + 1] as u32) << 8)
      | (input[i + 2] as u32);

    result.push(BASE64URL_CHARS[((chunk >> 18) & 0x3F) as usize] as char);
    result.push(BASE64URL_CHARS[((chunk >> 12) & 0x3F) as usize] as char);
    result.push(BASE64URL_CHARS[((chunk >> 6) & 0x3F) as usize] as char);
    result.push(BASE64URL_CHARS[(chunk & 0x3F) as usize] as char);

    i += 3;
  }

  // Handle remaining bytes without padding
  let remaining = input.len() - i;
  if remaining == 1 {
    let chunk = (input[i] as u32) << 16;
    result.push(BASE64URL_CHARS[((chunk >> 18) & 0x3F) as usize] as char);
    result.push(BASE64URL_CHARS[((chunk >> 12) & 0x3F) as usize] as char);
  } else if remaining == 2 {
    let chunk = ((input[i] as u32) << 16) | ((input[i + 1] as u32) << 8);
    result.push(BASE64URL_CHARS[((chunk >> 18) & 0x3F) as usize] as char);
    result.push(BASE64URL_CHARS[((chunk >> 12) & 0x3F) as usize] as char);
    result.push(BASE64URL_CHARS[((chunk >> 6) & 0x3F) as usize] as char);
  }

  result
}
#[derive(Debug)]
pub enum Os {
  Linux,
  Mac,
  Windows,
  Other(OtherString<3>),
}

#[derive(Debug)]
pub struct Version {
  pub major: u64,
  pub minor: u64,
  pub patch: u64,
  pub canary_hash: CanaryHash,
  pub dev_build: bool,
}

#[derive(Debug, Default)]
pub struct CanaryHash(Option<OtherString<1>>);

impl CanaryHash {
  pub fn new(s: String) -> Self {
    Self(Some(s.into()))
  }
}

impl<S: AsRef<str>> From<Option<S>> for CanaryHash {
  fn from(value: Option<S>) -> Self {
    Self(value.map(|s| s.as_ref().to_string().into()))
  }
}

impl Encode for CanaryHash {
  fn encoded_size(&self) -> usize {
    match self.0.as_ref() {
      Some(value) => value.encoded_size(),
      None => 1,
    }
  }

  fn encode_into(&self, buf: &mut [u8]) -> usize {
    match self.0.as_ref() {
      Some(value) => value.encode_into(buf),
      None => {
        buf[0] = 0;
        1
      }
    }
  }
}

#[derive(Debug)]

pub struct Header {
  trace_version: u8,
  os: Os,
  version: Version,
  arch: Arch,
}

#[derive(Debug)]
pub enum Arch {
  X86_64,
  Aarch64,
  Other(OtherString<2>),
}

impl Encode for Arch {
  fn encoded_size(&self) -> usize {
    match self {
      Arch::X86_64 | Arch::Aarch64 => 1,
      Arch::Other(other_string) => other_string.encoded_size(),
    }
  }

  fn encode_into(&self, buf: &mut [u8]) -> usize {
    match self {
      Arch::X86_64 => {
        buf[0] = 0;
        1
      }
      Arch::Aarch64 => {
        buf[0] = 1;
        1
      }
      Arch::Other(other_string) => other_string.encode_into(buf),
    }
  }
}

#[derive(Debug)]
pub struct OtherString<const MIN: usize> {
  value: String,
}

impl<const MIN: usize> From<String> for OtherString<MIN> {
  fn from(value: String) -> Self {
    Self { value }
  }
}

impl<const MIN: usize> OtherString<MIN> {
  fn new(value: String) -> Self {
    Self { value }
  }
}

impl<const MIN: usize> Encode for OtherString<MIN> {
  fn encoded_size(&self) -> usize {
    1 + self.value.len().clamp(MIN, u8::MAX as usize)
  }

  fn encode_into(&self, buf: &mut [u8]) -> usize {
    let trunc_len = self.value.len().clamp(0, u8::MAX as usize);
    let min_len = MIN;
    let mut i = 0;
    buf[i] = min_len.max(trunc_len) as u8;
    i += 1;
    buf[i..i + trunc_len].copy_from_slice(&self.value.as_bytes()[0..trunc_len]);
    i += trunc_len;
    let pad = min_len.saturating_sub(trunc_len);
    for _ in 0..pad {
      buf[i] = b' ';
      i += 1;
    }
    i
  }
}

pub trait Encode {
  fn encoded_size(&self) -> usize;
  fn encode_into(&self, buf: &mut [u8]) -> usize;
  fn encode(&self, buf: &mut Vec<u8>) -> usize {
    buf.extend(std::iter::repeat_n(0, self.encoded_size()));
    self.encode_into(buf)
  }
}

impl Encode for Os {
  fn encoded_size(&self) -> usize {
    match self {
      Os::Linux | Os::Mac | Os::Windows => 1,
      Os::Other(value) => value.encoded_size(),
    }
  }

  fn encode_into(&self, buf: &mut [u8]) -> usize {
    match self {
      Os::Linux => {
        buf[0] = 0;
        1
      }
      Os::Mac => {
        buf[0] = 1;
        1
      }
      Os::Windows => {
        buf[0] = 2;
        1
      }
      Os::Other(other) => other.encode_into(buf),
    }
  }
}

impl Encode for u64 {
  fn encoded_size(&self) -> usize {
    varint_encoded_size(*self)
  }

  fn encode_into(&self, buf: &mut [u8]) -> usize {
    varint_encode_into(buf, *self)
  }
}

impl Encode for bool {
  fn encoded_size(&self) -> usize {
    1
  }
  fn encode_into(&self, buf: &mut [u8]) -> usize {
    buf[0] = if *self { 1 } else { 0 };
    1
  }
}

impl Encode for Version {
  fn encoded_size(&self) -> usize {
    self.major.encoded_size()
      + self.minor.encoded_size()
      + self.patch.encoded_size()
      + self.canary_hash.encoded_size()
      + self.dev_build.encoded_size()
  }
  fn encode_into(&self, buf: &mut [u8]) -> usize {
    let mut i = 0;
    i += self.major.encode_into(&mut buf[i..]);
    i += self.minor.encode_into(&mut buf[i..]);
    i += self.patch.encode_into(&mut buf[i..]);
    i += self.canary_hash.encode_into(&mut buf[i..]);
    i += self.dev_build.encode_into(&mut buf[i..]);
    i
  }
}

impl Encode for Header {
  fn encoded_size(&self) -> usize {
    (self.trace_version.encoded_size())
      + (self.os.encoded_size())
      + (self.version.encoded_size())
      + (self.arch.encoded_size())
  }

  fn encode_into(&self, buf: &mut [u8]) -> usize {
    let mut i = 0;
    i += self.trace_version.encode_into(&mut buf[i..]);
    i += self.os.encode_into(&mut buf[i..]);
    i += self.version.encode_into(&mut buf[i..]);
    i += self.arch.encode_into(&mut buf[i..]);
    i
  }
}

impl Encode for u8 {
  fn encoded_size(&self) -> usize {
    (*self as u64).encoded_size()
  }

  fn encode_into(&self, buf: &mut [u8]) -> usize {
    (*self as u64).encode_into(buf)
  }
}

#[derive(Debug)]
pub struct StackTrace {
  header: Header,
  addrs: Addrs,
}

impl StackTrace {
  pub fn new(
    addrs: Vec<u64>,
    target_arch: &str,
    target_os: &str,
    version: Version,
  ) -> Self {
    StackTrace {
      header: Header {
        arch: match target_arch {
          "aarch64" => Arch::Aarch64,
          "x86_64" => Arch::X86_64,
          other => Arch::Other(OtherString::new(other.into())),
        },
        trace_version: 0,
        os: match target_os {
          "macos" => Os::Mac,
          "linux" => Os::Linux,
          "windows" => Os::Windows,
          value => Os::Other(OtherString::new(value.into())),
        },
        version,
      },
      addrs: Addrs(addrs),
    }
  }

  pub fn encode(&self) -> Vec<u8> {
    let mut buf = Vec::new();
    <Self as Encode>::encode(self, &mut buf);
    buf
  }

  pub fn encode_base64url(&self) -> String {
    let encoded = self.encode();
    base64url_encode(&encoded)
  }
}

#[derive(Debug)]
struct Addrs(Vec<u64>);
impl Encode for Addrs {
  fn encoded_size(&self) -> usize {
    self.0.iter().map(|v| v.encoded_size()).sum()
  }

  fn encode_into(&self, buf: &mut [u8]) -> usize {
    let mut i = 0;
    for &v in &self.0 {
      i += v.encode_into(&mut buf[i..]);
    }
    i
  }
}

impl Encode for StackTrace {
  fn encoded_size(&self) -> usize {
    self.header.encoded_size() + self.addrs.encoded_size()
  }

  fn encode_into(&self, buf: &mut [u8]) -> usize {
    let mut i = 0;
    i += self.header.encode_into(&mut buf[i..]);
    i += self.addrs.encode_into(&mut buf[i..]);
    i
  }
}
