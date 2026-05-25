use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::local_db::settings::SettingsRepository;

const LOCAL_USER_SETTING_KEY: &str = "local.user";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalUserRecord {
    pub id: String,
    pub name: String,
    pub nickname: String,
    pub role: String,
    pub image: String,
    pub password_hash: String,
    pub password_salt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalUserPublic {
    pub id: String,
    pub name: String,
    pub nickname: String,
    pub role: String,
    pub image: String,
    pub login_type: String,
    pub password: String,
}

impl LocalUserRecord {
    pub fn verify_password(&self, password: &str) -> bool {
        hash_password(password, &self.password_salt) == self.password_hash
    }

    pub fn to_public(&self) -> LocalUserPublic {
        LocalUserPublic {
            id: self.id.clone(),
            name: self.name.clone(),
            nickname: self.nickname.clone(),
            role: self.role.clone(),
            image: self.image.clone(),
            login_type: "password".to_string(),
            password: "".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct LocalUserUpdate {
    pub name: Option<String>,
    pub nickname: Option<String>,
    pub password: Option<String>,
    pub image: Option<String>,
    pub role: Option<String>,
}

pub async fn load_local_user(
    repo: &SettingsRepository,
) -> Result<Option<LocalUserRecord>, String> {
    let setting = repo.get(LOCAL_USER_SETTING_KEY).await?;
    if let Some(setting) = setting {
        let record = serde_json::from_str::<LocalUserRecord>(&setting.value)
            .map_err(|e| format!("Failed to parse local user: {e}"))?;
        Ok(Some(record))
    } else {
        Ok(None)
    }
}

pub async fn create_local_user(
    repo: &SettingsRepository,
    device_id: &str,
    name: &str,
    password: &str,
) -> Result<LocalUserRecord, String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("Username cannot be empty".to_string());
    }
    if password.is_empty() {
        return Err("Password cannot be empty".to_string());
    }

    let salt = Uuid::new_v4().to_string();
    let password_hash = hash_password(password, &salt);
    let record = LocalUserRecord {
        id: Uuid::new_v4().to_string(),
        name: trimmed_name.to_string(),
        nickname: trimmed_name.to_string(),
        role: "superadmin".to_string(),
        image: "".to_string(),
        password_hash,
        password_salt: salt,
    };
    save_local_user(repo, device_id, &record).await?;
    Ok(record)
}

pub async fn update_local_user(
    repo: &SettingsRepository,
    device_id: &str,
    record: &LocalUserRecord,
    update: LocalUserUpdate,
) -> Result<LocalUserRecord, String> {
    let mut next = record.clone();
    if let Some(name) = update.name {
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            next.name = trimmed.to_string();
        }
    }
    if let Some(nickname) = update.nickname {
        let trimmed = nickname.trim();
        if !trimmed.is_empty() {
            next.nickname = trimmed.to_string();
        }
    }
    if let Some(image) = update.image {
        next.image = image;
    }
    if let Some(role) = update.role {
        next.role = role;
    }
    if let Some(password) = update.password {
        if !password.is_empty() {
            let salt = Uuid::new_v4().to_string();
            let password_hash = hash_password(&password, &salt);
            next.password_salt = salt;
            next.password_hash = password_hash;
        }
    }
    save_local_user(repo, device_id, &next).await?;
    Ok(next)
}

pub async fn clear_local_user(repo: &SettingsRepository) -> Result<(), String> {
    repo.delete(LOCAL_USER_SETTING_KEY).await
}

pub async fn save_local_user(
    repo: &SettingsRepository,
    device_id: &str,
    record: &LocalUserRecord,
) -> Result<(), String> {
    let payload = serde_json::to_string(record)
        .map_err(|e| format!("Failed to serialize local user: {e}"))?;
    repo.set(LOCAL_USER_SETTING_KEY, &payload, device_id).await?;
    Ok(())
}

/// Ensures a default local user exists, creating one if needed.
/// This is called on app startup to ensure the user can authenticate after DB reset.
pub async fn ensure_default_user(
    repo: &SettingsRepository,
    device_id: &str,
) -> Result<(), String> {
    // Check if any local user exists
    if load_local_user(repo).await?.is_some() {
        return Ok(()); // User already exists
    }

    // Create default user with random password
    let default_username = "local";
    let random_password = Uuid::new_v4().to_string();

    create_local_user(repo, device_id, default_username, &random_password).await?;

    // Store credentials in settings for frontend access
    repo.set("default_username", default_username, device_id).await?;
    repo.set("default_password", &random_password, device_id).await?;

    eprintln!("✓ Created default local user with auto-generated credentials");
    eprintln!("  Username: {}", default_username);
    eprintln!("  Password stored in settings (accessible via Tauri command)");

    Ok(())
}

fn hash_password(password: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(b":");
    hasher.update(password.as_bytes());
    let digest = hasher.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest.iter() {
        out.push_str(&format!("{:02x}", byte));
    }
    out
}
