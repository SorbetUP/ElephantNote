//! Atomic Rust port of Muya.
//!
//! Modules mirror the decomposed JavaScript tree. During migration, JavaScript
//! remains the behavior oracle and each Rust module is enabled only after its
//! parity tests are green.

pub mod parser;
pub mod utils;
