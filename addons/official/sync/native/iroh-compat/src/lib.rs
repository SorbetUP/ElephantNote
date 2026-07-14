//! Narrow compatibility facade for the Iroh API used by the physical Sync package.
//!
//! Iroh 1.0 keeps `Connection` under `iroh::endpoint`; older package targets
//! imported it from the crate root. Re-exporting the upstream crate here keeps
//! all targets on one concrete Iroh version while those imports are migrated.

pub use iroh_upstream::*;
pub use iroh_upstream::endpoint::Connection;
