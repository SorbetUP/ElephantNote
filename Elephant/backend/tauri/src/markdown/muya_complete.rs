use serde::{Deserialize, Serialize};

use super::muya_engine::{
    apply_command, apply_commands, utf16_len, utf16_to_byte_index, MuyaEditorCommand,
    MuyaEditorState, MuyaEditorTransaction, MuyaSelection,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum MuyaCompleteCommand {
    ReplaceRange {
        start: usize,
        end: usize,
        #[serde(default)]
        text: String,
    },
    DeleteBackward,
    DeleteForward,
    InsertParagraph {
        location: String,
        #[serde(default)]
        text: String,
    },
    DuplicateBlock,
    DeleteBlock,
    MoveBlock {
        from_start: usize,
        from_end: usize,
        target: usize,
    },
    IndentSelection {
        #[serde(default)]
        outdent: bool,
        #[serde(default = "default_indent_width")]
        width: usize,
    },
    ToggleTask,
    SetCodeLanguage {
        #[serde(default)]
        language: String,
    },
    InsertLink {
        url: String,
        #[serde(default)]
        title: String,
    },
    RemoveLink,
    SearchReplace {
        query: String,
        #[serde(default)]
        replacement: String,
        #[serde(default)]
        replace_all: bool,
        #[serde(default)]
        case_sensitive: bool,
        #[serde(default)]
        whole_word: bool,
    },
    SelectAll,
}

fn default_indent_width() -> usize {
    2
}

pub fn apply_complete_command(
    state: MuyaEditorState,
    command: MuyaCompleteCommand,
) -> Result<MuyaEditorTransaction, String> {
    match command {
        MuyaCompleteCommand::ReplaceRange { start, end, text } => {
            apply_replace_range(state, start, end, text)
        }
        MuyaCompleteCommand::DeleteBackward => {
            apply_command(state, MuyaEditorCommand::DeleteBackward)
        }
        MuyaCompleteCommand::DeleteForward => {
            apply_command(state, MuyaEditorCommand::DeleteForward)
        }
        MuyaCompleteCommand::InsertParagraph { location, text } => {
            insert_paragraph(state, &location, &text)
        }
        MuyaCompleteCommand::DuplicateBlock => duplicate_selected_lines(state),
        MuyaCompleteCommand::DeleteBlock => delete_selected_lines(state),
        MuyaCompleteCommand::MoveBlock {
            from_start,
            from_end,
            target,
        } => move_range(state, from_start, from_end, target),
        MuyaCompleteCommand::IndentSelection { outdent, width } => {
            indent_selected_lines(state, outdent, width.clamp(1, 8))
        }
        MuyaCompleteCommand::ToggleTask => toggle_task(state),
        MuyaCompleteCommand::SetCodeLanguage { language } => {
            set_code_language(state, &language)
        }
        MuyaCompleteCommand::InsertLink { url, title } => insert_link(state, &url, &title),
        MuyaCompleteCommand::RemoveLink => remove_link(state),
        MuyaCompleteCommand::SearchReplace {
            query,
            replacement,
            replace_all,
            case_sensitive,
            whole_word,
        } => search_replace(
            state,
            &query,
            &replacement,
            replace_all,
            case_sensitive,
            whole_word,
        ),
        MuyaCompleteCommand::SelectAll => {
            let end = utf16_len(&state.markdown);
            apply_command(
                state,
                MuyaEditorCommand::SetSelection {
                    anchor: 0,
                    focus: end,
                },
            )
        }
    }
}

fn apply_replace_range(
    state: MuyaEditorState,
    start: usize,
    end: usize,
    text: String,
) -> Result<MuyaEditorTransaction, String> {
    let maximum = utf16_len(&state.markdown);
    let start = start.min(maximum);
    let end = end.min(maximum);
    apply_commands(
        state,
        vec![
            MuyaEditorCommand::SetSelection {
                anchor: start,
                focus: end,
            },
            MuyaEditorCommand::ReplaceSelection { text },
        ],
    )
}

fn replace_document(
    state: MuyaEditorState,
    markdown: String,
    selection: MuyaSelection,
) -> Result<MuyaEditorTransaction, String> {
    if state.markdown == markdown {
        return apply_command(
            state,
            MuyaEditorCommand::SetSelection {
                anchor: selection.anchor,
                focus: selection.focus,
            },
        );
    }
    let end = utf16_len(&state.markdown);
    apply_commands(
        state,
        vec![
            MuyaEditorCommand::SetSelection {
                anchor: 0,
                focus: end,
            },
            MuyaEditorCommand::ReplaceSelection { text: markdown },
            MuyaEditorCommand::SetSelection {
                anchor: selection.anchor,
                focus: selection.focus,
            },
        ],
    )
}

fn selected_line_range(markdown: &str, selection: MuyaSelection) -> (usize, usize) {
    let start = utf16_to_byte_index(markdown, selection.start().min(utf16_len(markdown)));
    let end = utf16_to_byte_index(markdown, selection.end().min(utf16_len(markdown)));
    let line_start = markdown[..start]
        .rfind('\n')
        .map_or(0, |index| index + 1);
    let line_end = markdown[end..]
        .find('\n')
        .map_or(markdown.len(), |offset| end + offset);
    (line_start, line_end)
}

fn byte_to_utf16(markdown: &str, byte_index: usize) -> usize {
    markdown[..byte_index.min(markdown.len())]
        .encode_utf16()
        .count()
}

fn insert_paragraph(
    state: MuyaEditorState,
    location: &str,
    text: &str,
) -> Result<MuyaEditorTransaction, String> {
    let (line_start, line_end) = selected_line_range(&state.markdown, state.selection);
    let (insert_at, insertion, cursor_byte) = match location {
        "before" => {
            let insertion = format!("{text}\n");
            (line_start, insertion, line_start + text.len())
        }
        "after" => {
            let insertion = format!("\n{text}");
            (line_end, insertion, line_end + 1 + text.len())
        }
        other => return Err(format!("unsupported Muya paragraph location: {other}")),
    };
    let mut markdown = state.markdown.clone();
    markdown.insert_str(insert_at, &insertion);
    let cursor = byte_to_utf16(&markdown, cursor_byte);
    replace_document(state, markdown, MuyaSelection::collapsed(cursor))
}

fn duplicate_selected_lines(state: MuyaEditorState) -> Result<MuyaEditorTransaction, String> {
    let (start, end) = selected_line_range(&state.markdown, state.selection);
    let block = state.markdown[start..end].to_string();
    let mut markdown = state.markdown.clone();
    let insertion = format!("\n{block}");
    markdown.insert_str(end, &insertion);
    let cursor = byte_to_utf16(&markdown, end + insertion.len());
    replace_document(state, markdown, MuyaSelection::collapsed(cursor))
}

fn delete_selected_lines(state: MuyaEditorState) -> Result<MuyaEditorTransaction, String> {
    let (mut start, mut end) = selected_line_range(&state.markdown, state.selection);
    if end < state.markdown.len() {
        end += 1;
    } else if start > 0 {
        start -= 1;
    }
    let mut markdown = state.markdown.clone();
    markdown.replace_range(start..end, "");
    let cursor = byte_to_utf16(&markdown, start.min(markdown.len()));
    replace_document(state, markdown, MuyaSelection::collapsed(cursor))
}

fn move_range(
    state: MuyaEditorState,
    from_start: usize,
    from_end: usize,
    target: usize,
) -> Result<MuyaEditorTransaction, String> {
    let maximum = utf16_len(&state.markdown);
    let start_utf16 = from_start.min(maximum);
    let end_utf16 = from_end.min(maximum);
    let start = utf16_to_byte_index(&state.markdown, start_utf16.min(end_utf16));
    let end = utf16_to_byte_index(&state.markdown, start_utf16.max(end_utf16));
    let target = utf16_to_byte_index(&state.markdown, target.min(maximum));
    if start == end || (target >= start && target <= end) {
        return Ok(MuyaEditorTransaction {
            state,
            document_changed: false,
            selection_changed: false,
        });
    }
    let fragment = state.markdown[start..end].to_string();
    let mut markdown = state.markdown.clone();
    markdown.replace_range(start..end, "");
    let adjusted_target = if target > end {
        target - (end - start)
    } else {
        target
    };
    markdown.insert_str(adjusted_target, &fragment);
    let anchor = byte_to_utf16(&markdown, adjusted_target);
    let focus = anchor + utf16_len(&fragment);
    replace_document(state, markdown, MuyaSelection { anchor, focus })
}

fn indent_selected_lines(
    state: MuyaEditorState,
    outdent: bool,
    width: usize,
) -> Result<MuyaEditorTransaction, String> {
    let (start, end) = selected_line_range(&state.markdown, state.selection);
    let selected = &state.markdown[start..end];
    let indent = " ".repeat(width);
    let mut changed_prefix = 0usize;
    let transformed = selected
        .split('\n')
        .map(|line| {
            if outdent {
                let removable = line
                    .chars()
                    .take(width)
                    .take_while(|character| *character == ' ')
                    .count();
                changed_prefix = changed_prefix.max(removable);
                line[removable..].to_string()
            } else {
                changed_prefix = width;
                format!("{indent}{line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    let mut markdown = state.markdown.clone();
    markdown.replace_range(start..end, &transformed);
    let original_start_utf16 = byte_to_utf16(&state.markdown, start);
    let anchor = if outdent {
        state.selection.anchor.saturating_sub(changed_prefix)
    } else {
        state.selection.anchor.saturating_add(width)
    };
    let focus_delta = transformed.encode_utf16().count() as isize - selected.encode_utf16().count() as isize;
    let focus = if focus_delta >= 0 {
        state.selection.focus.saturating_add(focus_delta as usize)
    } else {
        state.selection.focus.saturating_sub((-focus_delta) as usize)
    };
    let selection = MuyaSelection {
        anchor: anchor.max(original_start_utf16),
        focus,
    };
    replace_document(state, markdown, selection)
}

fn toggle_task(state: MuyaEditorState) -> Result<MuyaEditorTransaction, String> {
    let (start, end) = selected_line_range(&state.markdown, state.selection);
    let line = &state.markdown[start..end];
    let indentation = line.len() - line.trim_start_matches([' ', '\t']).len();
    let (prefix, body) = line.split_at(indentation);
    let replacement = if let Some(rest) = body.strip_prefix("- [ ] ") {
        format!("{prefix}- [x] {rest}")
    } else if let Some(rest) = body
        .strip_prefix("- [x] ")
        .or_else(|| body.strip_prefix("- [X] "))
    {
        format!("{prefix}- [ ] {rest}")
    } else {
        format!("{prefix}- [ ] {body}")
    };
    let mut markdown = state.markdown.clone();
    markdown.replace_range(start..end, &replacement);
    let cursor = byte_to_utf16(&markdown, start + replacement.len());
    replace_document(state, markdown, MuyaSelection::collapsed(cursor))
}

fn set_code_language(
    state: MuyaEditorState,
    language: &str,
) -> Result<MuyaEditorTransaction, String> {
    let cursor = utf16_to_byte_index(&state.markdown, state.selection.focus);
    let line_start = state.markdown[..cursor]
        .rfind('\n')
        .map_or(0, |index| index + 1);
    let before = &state.markdown[..line_start];
    let fence_start = before
        .rmatch_indices("\n```")
        .next()
        .map(|(index, _)| index + 1)
        .or_else(|| state.markdown.starts_with("```").then_some(0))
        .or_else(|| {
            before
                .rmatch_indices("\n~~~")
                .next()
                .map(|(index, _)| index + 1)
        })
        .or_else(|| state.markdown.starts_with("~~~").then_some(0))
        .ok_or_else(|| "cursor is not inside a fenced code block".to_string())?;
    let marker = if state.markdown[fence_start..].starts_with("~~~") {
        "~~~"
    } else {
        "```"
    };
    let header_end = state.markdown[fence_start..]
        .find('\n')
        .map_or(state.markdown.len(), |offset| fence_start + offset);
    let closing = state.markdown[header_end..]
        .find(&format!("\n{marker}"))
        .map(|offset| header_end + offset + 1)
        .ok_or_else(|| "fenced code block has no closing marker".to_string())?;
    if cursor > closing {
        return Err("cursor is not inside the selected fenced code block".to_string());
    }
    let header = format!("{marker}{}", language.trim());
    let mut markdown = state.markdown.clone();
    markdown.replace_range(fence_start..header_end, &header);
    let delta = header.len() as isize - (header_end - fence_start) as isize;
    let focus = if delta >= 0 {
        state.selection.focus.saturating_add(delta as usize)
    } else {
        state.selection.focus.saturating_sub((-delta) as usize)
    };
    replace_document(state, markdown, MuyaSelection::collapsed(focus))
}

fn insert_link(
    state: MuyaEditorState,
    url: &str,
    title: &str,
) -> Result<MuyaEditorTransaction, String> {
    if url.trim().is_empty() || url.contains(['\r', '\n']) {
        return Err("Muya link URL must be a non-empty single line".to_string());
    }
    let start = utf16_to_byte_index(&state.markdown, state.selection.start());
    let end = utf16_to_byte_index(&state.markdown, state.selection.end());
    let label = if start == end {
        url
    } else {
        &state.markdown[start..end]
    };
    let suffix = if title.trim().is_empty() {
        String::new()
    } else {
        format!(" \"{}\"", title.replace('"', "\\\""))
    };
    let replacement = format!("[{label}]({url}{suffix})");
    apply_replace_range(
        state,
        byte_to_utf16(&state.markdown, start),
        byte_to_utf16(&state.markdown, end),
        replacement,
    )
}

fn remove_link(state: MuyaEditorState) -> Result<MuyaEditorTransaction, String> {
    let cursor = utf16_to_byte_index(&state.markdown, state.selection.focus);
    let open = state.markdown[..cursor]
        .rfind('[')
        .ok_or_else(|| "no Markdown link at selection".to_string())?;
    let close_label = state.markdown[open..]
        .find("](")
        .map(|offset| open + offset)
        .ok_or_else(|| "no Markdown link at selection".to_string())?;
    let close = state.markdown[close_label + 2..]
        .find(')')
        .map(|offset| close_label + 2 + offset)
        .ok_or_else(|| "no Markdown link at selection".to_string())?;
    if cursor < open || cursor > close + 1 {
        return Err("no Markdown link at selection".to_string());
    }
    let label = state.markdown[open + 1..close_label].to_string();
    apply_replace_range(
        state,
        byte_to_utf16(&state.markdown, open),
        byte_to_utf16(&state.markdown, close + 1),
        label,
    )
}

fn search_replace(
    state: MuyaEditorState,
    query: &str,
    replacement: &str,
    replace_all: bool,
    case_sensitive: bool,
    whole_word: bool,
) -> Result<MuyaEditorTransaction, String> {
    if query.is_empty() {
        return Err("Muya search query must not be empty".to_string());
    }
    let haystack = if case_sensitive {
        state.markdown.clone()
    } else {
        state.markdown.to_lowercase()
    };
    let needle = if case_sensitive {
        query.to_string()
    } else {
        query.to_lowercase()
    };
    let mut matches = Vec::new();
    let mut offset = 0usize;
    while let Some(relative) = haystack[offset..].find(&needle) {
        let start = offset + relative;
        let end = start + needle.len();
        let valid = !whole_word
            || (is_word_boundary(&state.markdown, start) && is_word_boundary(&state.markdown, end));
        if valid {
            matches.push((start, end));
            if !replace_all {
                break;
            }
        }
        offset = end.max(start + 1);
        if offset >= haystack.len() {
            break;
        }
    }
    if matches.is_empty() {
        return Ok(MuyaEditorTransaction {
            state,
            document_changed: false,
            selection_changed: false,
        });
    }
    let mut markdown = state.markdown.clone();
    for (start, end) in matches.iter().rev() {
        markdown.replace_range(*start..*end, replacement);
    }
    let (first_start, _) = matches[0];
    let selection = MuyaSelection {
        anchor: byte_to_utf16(&markdown, first_start),
        focus: byte_to_utf16(&markdown, first_start + replacement.len()),
    };
    replace_document(state, markdown, selection)
}

fn is_word_boundary(text: &str, byte_index: usize) -> bool {
    let before = text[..byte_index.min(text.len())].chars().next_back();
    let after = text[byte_index.min(text.len())..].chars().next();
    before.map_or(true, |character| !character.is_alphanumeric() && character != '_')
        || after.map_or(true, |character| !character.is_alphanumeric() && character != '_')
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state(markdown: &str, anchor: usize, focus: usize) -> MuyaEditorState {
        let mut state = MuyaEditorState::new(markdown.to_string());
        state.selection = MuyaSelection { anchor, focus };
        state
    }

    #[test]
    fn duplicates_and_deletes_complete_lines() {
        let duplicated = apply_complete_command(
            state("alpha\nbeta", 1, 1),
            MuyaCompleteCommand::DuplicateBlock,
        )
        .unwrap();
        assert_eq!(duplicated.state.markdown, "alpha\nalpha\nbeta");
        let deleted = apply_complete_command(
            duplicated.state,
            MuyaCompleteCommand::DeleteBlock,
        )
        .unwrap();
        assert_eq!(deleted.state.markdown, "alpha\nbeta");
    }

    #[test]
    fn indents_and_outdents_selected_lines() {
        let indented = apply_complete_command(
            state("a\nb", 0, 3),
            MuyaCompleteCommand::IndentSelection {
                outdent: false,
                width: 2,
            },
        )
        .unwrap();
        assert_eq!(indented.state.markdown, "  a\n  b");
        let outdented = apply_complete_command(
            indented.state,
            MuyaCompleteCommand::IndentSelection {
                outdent: true,
                width: 2,
            },
        )
        .unwrap();
        assert_eq!(outdented.state.markdown, "a\nb");
    }

    #[test]
    fn toggles_tasks_and_replaces_search_matches() {
        let task = apply_complete_command(
            state("item", 0, 0),
            MuyaCompleteCommand::ToggleTask,
        )
        .unwrap();
        assert_eq!(task.state.markdown, "- [ ] item");
        let replaced = apply_complete_command(
            state("One one ONE", 0, 0),
            MuyaCompleteCommand::SearchReplace {
                query: "one".to_string(),
                replacement: "two".to_string(),
                replace_all: true,
                case_sensitive: false,
                whole_word: true,
            },
        )
        .unwrap();
        assert_eq!(replaced.state.markdown, "two two two");
    }

    #[test]
    fn inserts_and_removes_links() {
        let linked = apply_complete_command(
            state("hello", 0, 5),
            MuyaCompleteCommand::InsertLink {
                url: "https://example.com".to_string(),
                title: String::new(),
            },
        )
        .unwrap();
        assert_eq!(linked.state.markdown, "[hello](https://example.com)");
        let mut linked_state = linked.state;
        linked_state.selection = MuyaSelection::collapsed(3);
        let unlinked = apply_complete_command(linked_state, MuyaCompleteCommand::RemoveLink).unwrap();
        assert_eq!(unlinked.state.markdown, "hello");
    }

    #[test]
    fn moves_ranges_without_losing_unicode() {
        let moved = apply_complete_command(
            state("😀A B", 0, 0),
            MuyaCompleteCommand::MoveBlock {
                from_start: 0,
                from_end: 3,
                target: 5,
            },
        )
        .unwrap();
        assert_eq!(moved.state.markdown, " B😀A");
    }
}
