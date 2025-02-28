use std::io::Cursor;

use symbolic::{
  common::ByteView,
  debuginfo::Archive,
  symcache::{SymCache, SymCacheConverter},
};
use symbolic_demangle::{Demangle, DemangleOptions};

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
  symcache: &SymCache,
) -> Result<Vec<Vec<FrameLocation>>, anyhow::Error> {
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

struct SymCacheWrapper<'a>(SymCache<'a>);

unsafe impl<'a> yoke::Yokeable<'a> for SymCacheWrapper<'static> {
  type Output = SymCacheWrapper<'a>;

  fn transform(&'a self) -> &'a Self::Output {
    self
  }

  fn transform_owned(self) -> Self::Output {
    self
  }

  unsafe fn make(from: Self::Output) -> Self {
    unsafe { std::mem::transmute(from) }
  }

  fn transform_mut<F>(&'a mut self, f: F)
  where
    // be VERY CAREFUL changing this signature, it is very nuanced (see above)
    F: 'static + for<'b> FnOnce(&'b mut Self::Output),
  {
    unsafe { f(std::mem::transmute::<&mut Self, &mut Self::Output>(self)) }
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

  pub fn as_ref<'a>(&'a self) -> &'a SymCache<'a> {
    &self.0.get().0
  }
}
