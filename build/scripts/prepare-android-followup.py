#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).with_name('finalize-android-followup.py')
text = path.read_text()
old = '''"    pub fn clear(&self, request: ShadowRequest) -> Result<TreeState> {\n        self.0.run_mobile_plugin(\"clear\", request).map_err(Into::into)\n    }\n",\n"    pub fn clear(&self, request: ShadowRequest) -> Result<TreeState> {\n        self.0.run_mobile_plugin(\"clear\", request).map_err(Into::into)\n    }\n\n    pub fn share_text(&self, request: ShareTextRequest) -> Result<()> {\n        self.0.run_mobile_plugin(\"shareText\", request).map_err(Into::into)\n    }\n")'''
new = '''"    pub fn clear(&self, payload: ShadowRequest) -> Result<TreeState> {\n        self.0\n            .run_mobile_plugin(\"clear\", payload)\n            .map_err(Into::into)\n    }\n",\n"    pub fn clear(&self, payload: ShadowRequest) -> Result<TreeState> {\n        self.0\n            .run_mobile_plugin(\"clear\", payload)\n            .map_err(Into::into)\n    }\n\n    pub fn share_text(&self, payload: ShareTextRequest) -> Result<()> {\n        self.0\n            .run_mobile_plugin(\"shareText\", payload)\n            .map_err(Into::into)\n    }\n")'''
if old not in text:
    raise SystemExit('Unable to adapt mobile plugin transformer anchor')
path.write_text(text.replace(old, new, 1))
print('Android follow-up transformer prepared')
