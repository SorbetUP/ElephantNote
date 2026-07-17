// Kept as a thin module entrypoint so package transport, source validation and tests remain reviewable.
include!("official_addon_catalog/catalog.rs");
include!("official_addon_catalog/source.rs");
include!("official_addon_catalog/install.rs");
include!("official_addon_catalog/tests.rs");
