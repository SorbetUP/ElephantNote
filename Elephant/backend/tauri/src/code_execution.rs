// The active implementation is kept in a separate file while this compatibility
// entrypoint remains stable for Tauri command registration. These two lints are
// confined to that implementation and do not affect the rest of the backend.
#![allow(dead_code, unused_mut)]

include!("code_execution_v2.rs");
