use std::path::Path;

use reqwest::Client;
use serde::Deserialize;
use tokio_util::io::ReaderStream;

use crate::local_db::attachments::Attachment;

use super::SyncOp;

#[derive(Debug, Deserialize)]
pub struct RemoteChanges {
    pub cursor: Option<String>,
    pub ops: Vec<SyncOp>,
    #[serde(default)]
    pub reset: bool,
}

#[derive(Clone)]
pub struct RemoteClient {
    base_url: String,
    token: Option<String>,
    client: Client,
}

impl RemoteClient {
    pub fn new(base_url: String, token: Option<String>) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            token,
            client: Client::new(),
        }
    }

    pub async fn pull_ops(
        &self,
        since: Option<&str>,
        device_id: Option<&str>,
        include_self: bool,
        limit: Option<u32>,
    ) -> Result<RemoteChanges, String> {
        let mut req = self.client.get(format!("{}/changes", self.base_url));
        if let Some(cursor) = since {
            req = req.query(&[("since", cursor)]);
        }
        if let Some(device_id) = device_id {
            req = req.query(&[("device_id", device_id)]);
        }
        if include_self {
            req = req.query(&[("include_self", "true")]);
        }
        if let Some(limit) = limit {
            req = req.query(&[("limit", limit)]);
        }
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        let res = req
            .send()
            .await
            .map_err(|e| format!("Failed to pull ops: {e}"))?;
        let status = res.status();
        if !status.is_success() {
            return Err(format!("Pull ops failed with status {status}"));
        }
        res.json::<RemoteChanges>()
            .await
            .map_err(|e| format!("Failed to parse pull ops response: {e}"))
    }

    pub async fn peek_cursor(&self) -> Result<Option<String>, String> {
        let res = self.pull_ops(Some("0"), None, true, Some(0)).await?;
        Ok(res.cursor)
    }

    pub async fn push_ops(&self, ops: &[SyncOp]) -> Result<(), String> {
        let mut req = self.client.post(format!("{}/changes", self.base_url));
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        let res = req
            .json(&serde_json::json!({ "ops": ops }))
            .send()
            .await
            .map_err(|e| format!("Failed to push ops: {e}"))?;
        let status = res.status();
        if !status.is_success() {
            return Err(format!("Push ops failed with status {status}"));
        }
        Ok(())
    }

    pub async fn upload_attachment(
        &self,
        attachment: &Attachment,
        file_path: &Path,
    ) -> Result<(), String> {
        let file = tokio::fs::File::open(file_path)
            .await
            .map_err(|e| format!("Failed to open attachment file: {e}"))?;
        let len = tokio::fs::metadata(file_path)
            .await
            .map(|m| m.len())
            .map_err(|e| format!("Failed to stat attachment file: {e}"))?;

        let stream = ReaderStream::new(file);
        let body = reqwest::Body::wrap_stream(stream);

        // Do not trust `attachment.mime` (it may be empty or invalid). Server-side sync materialization
        // already carries the right metadata; the upload transport can safely fall back to octet-stream.
        let part = reqwest::multipart::Part::stream_with_length(body, len)
            .file_name(attachment.filename.clone())
            .mime_str("application/octet-stream")
            .map_err(|e| format!("Failed to build multipart: {e}"))?;

        let form = reqwest::multipart::Form::new()
            .part("file", part)
            .text("sync_id", attachment.sync_id.clone());

        let mut req = self.client.post(format!("{}/api/file/upload", self.base_url));
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        let res = req
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Failed to upload attachment: {e}"))?;
        let status = res.status();
        if !status.is_success() {
            let body = res.text().await.unwrap_or_default();
            let snippet = if body.len() > 600 {
                format!("{}...", &body[..600])
            } else {
                body
            };
            return Err(format!(
                "Upload attachment failed with status {status}: {snippet}"
            ));
        }
        Ok(())
    }

    pub async fn download_attachment(&self, attachment_id: &str) -> Result<Vec<u8>, String> {
        let mut req = self.client.get(format!("{}/api/file/by-sync-id/{}", self.base_url, attachment_id));
        if let Some(token) = &self.token {
            req = req.bearer_auth(token);
        }
        let res = req
            .send()
            .await
            .map_err(|e| format!("Failed to download attachment: {e}"))?;
        let status = res.status();
        if !status.is_success() {
            return Err(format!("Download attachment failed with status {status}"));
        }
        res.bytes()
            .await
            .map(|bytes| bytes.to_vec())
            .map_err(|e| format!("Failed to read attachment bytes: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::RemoteChanges;

    #[test]
    fn remote_changes_parses_reset_flag() {
        let raw = r#"{"cursor":"12","ops":[],"reset":true}"#;
        let parsed: RemoteChanges = serde_json::from_str(raw).unwrap();
        assert_eq!(parsed.cursor.as_deref(), Some("12"));
        assert!(parsed.ops.is_empty());
        assert!(parsed.reset);
    }
}
