use deno_symbolicate::{OwnedSymCache, create_symcache, symbolicate_addrs};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn parse_symbol_cache(
  bytes: Vec<u8>,
) -> Result<*mut OwnedSymCache, String> {
  Ok(Box::into_raw(Box::new(
    OwnedSymCache::parse(bytes).map_err(|e| e.to_string())?,
  )))
}

#[wasm_bindgen]
pub struct SymbolCache {
  cache: OwnedSymCache,
}

#[wasm_bindgen]
impl SymbolCache {
  #[wasm_bindgen(constructor)]
  pub fn new(bytes: Vec<u8>) -> Result<Self, String> {
    let cache = OwnedSymCache::parse(bytes).map_err(|e| e.to_string())?;
    Ok(Self { cache })
  }

  #[wasm_bindgen]
  pub fn lookup_addrs(&self, addrs: Vec<u64>) -> Result<JsValue, String> {
    let value = symbolicate_addrs(&addrs, self.cache.as_ref())
      .map_err(|e| e.to_string())?;
    serde_wasm_bindgen::to_value(&value).map_err(|e| e.to_string())
  }
}

#[wasm_bindgen]
pub fn create_symbol_cache(debug_file: Vec<u8>) -> Result<Vec<u8>, String> {
  create_symcache(&debug_file).map_err(|e| e.to_string())
}
