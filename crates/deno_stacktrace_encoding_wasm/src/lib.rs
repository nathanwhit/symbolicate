use deno_stable_stacktrace::encode::StackTrace;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn encode_stack_trace(value: JsValue) -> Result<String, String> {
  let stack_trace: StackTrace =
    serde_wasm_bindgen::from_value(value).map_err(|e| e.to_string())?;
  Ok(stack_trace.encode_base64url())
}
