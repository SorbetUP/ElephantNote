use chrono::{Duration, NaiveDate, TimeZone, Utc};
use sqlx::{query_as, SqlitePool};
use std::collections::BTreeMap;

use crate::local_db::notes::NoteRepository;

#[derive(Debug, Clone)]
pub struct TagStat {
    pub tag_name: String,
    pub count: i64,
}

#[derive(Debug, Clone)]
pub struct MonthlyStats {
    pub note_count: i64,
    pub total_words: i64,
    pub max_daily_words: i64,
    pub active_days: i64,
    pub tag_stats: Vec<TagStat>,
}

pub async fn daily_note_count(pool: &SqlitePool) -> Result<Vec<(String, i64)>, String> {
    let note_repo = NoteRepository::new(pool.clone());
    let notes = note_repo.list_notes().await?;
    let cutoff = Utc::now() - Duration::days(365);
    let mut counts: BTreeMap<String, i64> = BTreeMap::new();
    for note in notes {
        if note.created_at < cutoff {
            continue;
        }
        let date = note.created_at.date_naive().format("%Y-%m-%d").to_string();
        *counts.entry(date).or_insert(0) += 1;
    }
    Ok(counts.into_iter().collect())
}

pub async fn monthly_stats(pool: &SqlitePool, month: &str) -> Result<MonthlyStats, String> {
    let (year, month) = month
        .split_once('-')
        .and_then(|(y, m)| Some((y.parse::<i32>().ok()?, m.parse::<u32>().ok()?)))
        .ok_or_else(|| "Invalid month format".to_string())?;

    let start_date =
        NaiveDate::from_ymd_opt(year, month, 1).ok_or_else(|| "Invalid month".to_string())?;
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let end_date = NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .ok_or_else(|| "Invalid month range".to_string())?
        - Duration::days(1);

    let start_dt = Utc.from_utc_datetime(&start_date.and_hms_opt(0, 0, 0).unwrap());
    let end_dt = Utc.from_utc_datetime(&end_date.and_hms_opt(23, 59, 59).unwrap());

    let note_repo = NoteRepository::new(pool.clone());
    let notes = note_repo.list_notes().await?;

    let mut note_count = 0_i64;
    let mut total_words = 0_i64;
    let mut daily_words: BTreeMap<NaiveDate, i64> = BTreeMap::new();

    for note in notes {
        if note.created_at < start_dt || note.created_at > end_dt {
            continue;
        }
        note_count += 1;
        let word_len = note.content.chars().count() as i64;
        total_words += word_len;
        let day = note.created_at.date_naive();
        *daily_words.entry(day).or_insert(0) += word_len;
    }

    let max_daily_words = daily_words.values().copied().max().unwrap_or(0);
    let active_days = daily_words.len() as i64;

    let rows = query_as::<_, (String, i64)>(
        "SELECT t.name, COUNT(nt.note_id) as count \
         FROM tags t \
         JOIN note_tags nt ON nt.tag_id = t.id \
         JOIN notes n ON n.id = nt.note_id \
         WHERE n.deleted_at IS NULL \
         GROUP BY t.id \
         ORDER BY count DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to query tag stats: {e}"))?;

    let mut tag_stats = Vec::new();
    let mut other_count = 0_i64;
    for (idx, (name, count)) in rows.into_iter().enumerate() {
        if idx < 10 {
            tag_stats.push(TagStat {
                tag_name: name,
                count,
            });
        } else {
            other_count += count;
        }
    }
    if other_count > 0 {
        tag_stats.push(TagStat {
            tag_name: "Others".to_string(),
            count: other_count,
        });
    }

    Ok(MonthlyStats {
        note_count,
        total_words,
        max_daily_words,
        active_days,
        tag_stats,
    })
}
