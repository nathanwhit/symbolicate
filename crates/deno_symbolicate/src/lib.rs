use std::io::Cursor;

use symbolic::{
  common::ByteView,
  debuginfo::Archive,
  symcache::{SymCache, SymCacheConverter},
};
use symbolic_demangle::{Demangle, DemangleOptions};

/// Creates an encoded `SymCache` from the contents of the debug info.
///
/// The encoded symcache can then be consumed through the `OwnedSymcache::parse`
/// method, to get a lifetime-less value, or through `parse_symcache` for a borrowed
/// version.
pub fn create_symcache(debug_file: &[u8]) -> Result<Vec<u8>, anyhow::Error> {
  let byteview = ByteView::from_slice(debug_file);
  let fat_obj = Archive::parse(&byteview)?;
  let objects: Result<Vec<_>, _> = fat_obj.objects().collect();
  let objects = objects?;
  if objects.len() != 1 {
    anyhow::bail!("Fat archives are not supported currently");
  }
  let object = &objects[0];
  let mut converter = SymCacheConverter::new();
  converter.process_object(object)?;

  let mut result = Vec::new();
  converter.serialize(&mut Cursor::new(&mut result))?;
  Ok(result)
}

pub fn parse_symcache(
  symcache: &[u8],
) -> Result<symbolic::symcache::SymCache<'_>, symbolic::symcache::Error> {
  SymCache::parse(symcache)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameLocation {
  pub demangled_name: String,
  pub name: String,
  pub language: String,
  pub full_path: String,
  pub line: u32,
}

pub fn symbolicate_addrs(
  addrs: &[u64],
  symcache: impl AsSymcache,
) -> Result<Vec<Vec<FrameLocation>>, anyhow::Error> {
  let symcache = symcache.as_symcache();
  let mut out = Vec::new();
  for &addr in addrs {
    let syms = symcache.lookup(addr).collect::<Vec<_>>();
    out.push(
      syms
        .into_iter()
        .map(|sym| FrameLocation {
          demangled_name: sym
            .function()
            .name_for_demangling()
            .try_demangle(DemangleOptions::name_only())
            .into_owned(),
          name: sym.function().name().into(),
          language: sym.function().language().to_string(),
          full_path: sym
            .file()
            .map(|file| file.full_path())
            .unwrap_or_else(|| "<unknown file>".into()),
          line: sym.line(),
        })
        .collect(),
    );
  }

  Ok(out)
}

use yoke::Yoke;

#[derive(yoke::Yokeable)]
struct SymCacheWrapper<'a>(SymCache<'a>);

pub trait AsSymcache {
  fn as_symcache(&self) -> &SymCache<'_>;
}

impl AsSymcache for OwnedSymCache {
  fn as_symcache(&self) -> &SymCache<'_> {
    self.as_ref()
  }
}

impl AsSymcache for &'_ OwnedSymCache {
  fn as_symcache(&self) -> &SymCache<'_> {
    self.as_ref()
  }
}

impl AsSymcache for SymCache<'_> {
  fn as_symcache(&self) -> &SymCache<'_> {
    self
  }
}

impl AsSymcache for &'_ SymCache<'_> {
  fn as_symcache(&self) -> &SymCache<'_> {
    self
  }
}

pub struct OwnedSymCache(Yoke<SymCacheWrapper<'static>, Vec<u8>>);

impl OwnedSymCache {
  pub fn parse(bytes: Vec<u8>) -> Result<Self, anyhow::Error> {
    Ok(Self(Yoke::try_attach_to_cart(bytes, |bytes| {
      let cache = SymCache::parse(bytes)?;
      Ok::<_, anyhow::Error>(SymCacheWrapper(cache))
    })?))
  }

  #[expect(clippy::should_implement_trait)]
  pub fn as_ref(&self) -> &SymCache<'_> {
    &self.0.get().0
  }
}
