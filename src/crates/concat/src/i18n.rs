// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer and Concat contributors

//! English platform-interface strings.
//!
//! The shipped English inventory is authoritative for the interface.
//! Saved, system and custom locale choices cannot replace it. Original locale
//! resources remain available to tooling; authored text, presets and subtitle
//! content are independent of this interface-language policy.

use std::collections::HashMap;
use std::fmt::Display;
use std::sync::{Arc, OnceLock, RwLock};

use concat_host::AppDirs;

/// A language the interface can be in.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Language {
    /// The locale's code, and the name of its file: "de", "pt-BR", ...
    pub code: String,
    /// The language's name for itself, as Settings lists it: whoever is
    /// stranded in a language they cannot read must still recognise their
    /// own.
    pub name: String,
}

/// The code the interface starts in, and the language of the keys.
pub const ENGLISH: &str = "en";

/// The locales the app ships, as `(code, file)`. `en.json` is the
/// inventory - every key, with its English - which is what a translator
/// starts a new file from, and what every language falls back to.
const BUILT_IN: [(&str, &str); 14] = [
    ("en", include_str!("../locales/en.json")),
    ("de", include_str!("../locales/de.json")),
    ("es", include_str!("../locales/es.json")),
    ("fa", include_str!("../locales/fa.json")),
    ("fr", include_str!("../locales/fr.json")),
    ("hr", include_str!("../locales/hr.json")),
    ("it", include_str!("../locales/it.json")),
    ("ja", include_str!("../locales/ja.json")),
    ("ko", include_str!("../locales/ko.json")),
    ("pt-BR", include_str!("../locales/pt-BR.json")),
    ("ru", include_str!("../locales/ru.json")),
    ("tr", include_str!("../locales/tr.json")),
    ("zh-Hans", include_str!("../locales/zh-Hans.json")),
    ("zh-TW", include_str!("../locales/zh-TW.json")),
];

/// One language's strings.
struct Catalog {
    code: String,
    strings: HashMap<String, String>,
}

fn active() -> &'static RwLock<Option<Arc<Catalog>>> {
    static ACTIVE: OnceLock<RwLock<Option<Arc<Catalog>>>> = OnceLock::new();
    ACTIVE.get_or_init(|| RwLock::new(None))
}

/// The English for every key, read once: what a key no locale translates
/// reads as, and - turned round - how a file keyed by the English is read.
struct English {
    by_key: HashMap<String, String>,
    by_text: HashMap<String, String>,
}

fn english() -> &'static English {
    static ENGLISH_STRINGS: OnceLock<English> = OnceLock::new();
    ENGLISH_STRINGS.get_or_init(|| {
        let by_key = parse(BUILT_IN[0].1)
            .map(|(_, strings)| strings)
            .unwrap_or_default();
        let by_text = by_key
            .iter()
            .map(|(key, text)| (text.clone(), key.clone()))
            .collect();
        English { by_key, by_text }
    })
}

/// A locale's lines keyed as the app asks for them: a line keyed by the
/// English itself, as every file was before keys, moved to the key
/// `en.json` gives that English. A key `en.json` does not know is kept, and
/// never asked for.
fn keyed(strings: HashMap<String, String>) -> HashMap<String, String> {
    let english = english();
    strings
        .into_iter()
        .map(|(key, value)| {
            if english.by_key.contains_key(&key) {
                (key, value)
            } else {
                match english.by_text.get(&key) {
                    Some(real) => (real.clone(), value),
                    None => (key, value),
                }
            }
        })
        .collect()
}

/// Where a machine's own locales live.
#[cfg(test)]
pub fn user_dir(dirs: &AppDirs) -> std::path::PathBuf {
    dirs.config.join("locales")
}

/// The platform interface offers English only. Content language is separate.
pub fn languages(_dirs: &AppDirs) -> Vec<Language> {
    vec![Language {
        code: ENGLISH.to_owned(),
        name: "English".to_owned(),
    }]
}

/// Selects the shipped English inventory regardless of a remembered locale.
/// Custom files, including an en.json override, never change platform labels.
pub fn select(_code: &str, _dirs: &AppDirs) {
    let catalog = Arc::new(Catalog {
        code: ENGLISH.to_owned(),
        strings: keyed(english().by_key.clone()),
    });
    if let Ok(mut slot) = active().write() {
        *slot = Some(catalog);
    }
}

/// The code of the language the interface is in.
pub fn current() -> String {
    active()
        .read()
        .ok()
        .and_then(|slot| slot.as_ref().map(|catalog| catalog.code.clone()))
        .unwrap_or_else(|| ENGLISH.to_owned())
}

/// `key` in the interface's language: its translation, else its English,
/// else - a key nothing lists - the key itself.
pub fn t(key: &str) -> String {
    translated(key)
        .or_else(|| english().by_key.get(key).cloned())
        .unwrap_or_else(|| key.to_owned())
}

/// `key` in the interface's language, or `fallback` - the English a
/// manifest carries - where no language has it.
pub fn t_or(key: &str, fallback: &str) -> String {
    translated(key).unwrap_or_else(|| fallback.to_owned())
}

/// The active language's line for `key`, if it has one.
fn translated(key: &str) -> Option<String> {
    active()
        .read()
        .ok()
        .and_then(|slot| slot.as_ref()?.strings.get(key).cloned())
}

/// A name as one segment of a key: its words in lowerCamelCase, with
/// `{0}`-style places and apostrophes left out and `&` read as "and" -
/// "Retro & Film" is `retroAndFilm`. `scripts/locales.py` makes the same
/// segments for the inventory; a test holds the two to each other.
pub fn key_part(text: &str) -> String {
    let mut plain = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '{' => {
                let mut held = String::from('{');
                while let Some(&d) = chars.peek() {
                    if !d.is_ascii_digit() {
                        break;
                    }
                    held.push(d);
                    chars.next();
                }
                if held.len() > 1 && chars.peek() == Some(&'}') {
                    chars.next();
                    plain.push(' ');
                } else {
                    plain.push_str(&held);
                }
            }
            '\'' | '\u{2019}' => {}
            '&' => plain.push_str(" and "),
            _ => plain.push(c),
        }
    }
    let mut out = String::new();
    for word in plain
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|word| !word.is_empty())
    {
        if out.is_empty() {
            out.push_str(&word.to_ascii_lowercase());
        } else {
            let mut letters = word.chars();
            if let Some(first) = letters.next() {
                out.push(first.to_ascii_uppercase());
                out.push_str(&letters.as_str().to_ascii_lowercase());
            }
        }
    }
    out
}

/// A package's `name` or `description`, from its manifest's `text`: looked
/// up as `effects.<name>.<field>` for one that ships with the app, and as
/// its author wrote it for anyone else's.
pub fn package_text(id: &str, field: &str, text: &str) -> String {
    match id.strip_prefix("concat.") {
        Some(name) => t_or(
            &format!("effects.{}.{field}", key_part(&name.replace('-', " "))),
            text,
        ),
        None => text.to_owned(),
    }
}

/// A shelf, a knob group or a knob's label from a manifest: looked up as
/// `effects.<kind>.<text>` - `kind` is `categories`, `groups` or `labels` -
/// and read as written where no language lists it, as a package of the
/// user's own may name its own.
pub fn shelf_text(kind: &str, text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    t_or(&format!("effects.{kind}.{}", key_part(text)), text)
}

/// [`t`], with `{0}`, `{1}`, ... replaced by `args` in order.
pub fn tf(key: &str, args: &[&dyn Display]) -> String {
    fill(&t(key), args)
}

/// `{0}`, `{1}`, ... in `text` replaced by `args`.
fn fill(text: &str, args: &[&dyn Display]) -> String {
    let mut out = text.to_owned();
    for (index, arg) in args.iter().enumerate() {
        out = out.replace(&format!("{{{index}}}"), &arg.to_string());
    }
    out
}

/// A locale file's name for its language and its strings. `None` for a
/// file that is not a JSON object.
fn parse(text: &str) -> Option<(String, HashMap<String, String>)> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    let object = value.as_object()?;
    let name = object
        .get("_")
        .and_then(|meta| meta.get("name"))
        .and_then(|name| name.as_str())
        .unwrap_or_default()
        .to_owned();
    let strings = object
        .iter()
        .filter(|(key, _)| key.as_str() != "_")
        .filter_map(|(key, value)| Some((key.clone(), value.as_str()?.to_owned())))
        .collect();
    Some((name, strings))
}

/// One test at a time may choose the language, since it is the process's;
/// and a test that reads English must hold this too, or it reads whatever
/// another thread chose (audit 2026-09-28, the two locale-flaky tests).
#[cfg(test)]
pub(crate) fn language_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn language() -> std::sync::MutexGuard<'static, ()> {
        language_lock()
    }

    /// The inventory: every key the app can ask for, as `en.json` lists
    /// them with their English. `scripts/locales.py` keeps it in step with
    /// the source.
    fn inventory() -> HashMap<String, String> {
        parse(BUILT_IN[0].1).expect("en.json parses").1
    }

    #[test]
    fn every_shipped_locale_parses_names_itself_and_keys_off_the_inventory() {
        let inventory = inventory();
        assert!(inventory.len() > 100, "the inventory is missing");
        for (code, text) in BUILT_IN {
            let (name, strings) = parse(text).unwrap_or_else(|| panic!("{code}.json parses"));
            assert!(!name.is_empty(), "{code}.json names its language");
            for key in strings.keys() {
                assert!(
                    inventory.contains_key(key),
                    "{code}.json translates {key:?}, which nothing asks for"
                );
            }
            if code != ENGLISH {
                // A shipped translation covers the inventory: a missing
                // line would read in English in the middle of a page.
                let missing: Vec<&String> = inventory
                    .keys()
                    .filter(|key| !strings.contains_key(*key))
                    .collect();
                assert!(missing.is_empty(), "{code}.json lacks {missing:?}");
            }
        }
    }

    #[test]
    fn both_chinese_standards_ship_under_their_own_names() {
        let names: HashMap<&str, String> = BUILT_IN
            .iter()
            .map(|(code, text)| (*code, parse(text).expect("parses").0))
            .collect();
        assert_eq!(names["zh-Hans"], "简体中文");
        assert_eq!(names["zh-TW"], "繁體中文");
        // The two files are different translations, not one in two scripts
        // with a handful of lines swapped: the Taiwan file speaks of
        // 檔案 and 影片, the mainland file of 文件 and 视频.
        let hans = parse(BUILT_IN.iter().find(|(c, _)| *c == "zh-Hans").unwrap().1)
            .unwrap()
            .1;
        let tw = parse(BUILT_IN.iter().find(|(c, _)| *c == "zh-TW").unwrap().1)
            .unwrap()
            .1;
        assert_eq!(hans["common.export"], "导出");
        assert_eq!(tw["common.export"], "匯出");
        assert_eq!(hans["common.settings"], "设置");
        assert_eq!(tw["common.settings"], "設定");
    }

    /// Every key is dotted lowerCamelCase: an area, then a name for the
    /// string in it.
    #[test]
    fn every_key_is_dotted_lower_camel_case() {
        for key in inventory().keys() {
            let segments: Vec<&str> = key.split('.').collect();
            let fine = segments.len() >= 2
                && segments.iter().all(|segment| {
                    segment.starts_with(|c: char| c.is_ascii_lowercase())
                        && segment.chars().all(|c| c.is_ascii_alphanumeric())
                });
            assert!(fine, "{key:?} is not an area and a name in lowerCamelCase");
        }
    }

    /// The keys the window makes from manifests and presets are the ones
    /// the inventory lists, with the manifests' own English: Rust's
    /// `key_part` and the script's agree on every shipped package.
    #[test]
    fn every_package_and_preset_key_is_in_the_inventory() {
        let inventory = inventory();
        let mut missing = Vec::new();
        let mut check = |key: String, english: &str| {
            if english.is_empty() {
                return;
            }
            match inventory.get(&key) {
                Some(listed) if listed == english => {}
                Some(listed) => missing.push(format!("{key}: {listed:?} is not {english:?}")),
                None => missing.push(format!("{key}: not listed ({english:?})")),
            }
        };
        for package in concat_effects::Catalogue::builtin().packages() {
            let meta = &package.manifest.effect;
            let name = meta.id.strip_prefix("concat.").expect("a built-in");
            let part = key_part(&name.replace('-', " "));
            check(format!("effects.{part}.name"), &meta.name);
            check(format!("effects.{part}.description"), &meta.description);
            check(
                format!("effects.categories.{}", key_part(&meta.category)),
                &meta.category,
            );
            for param in &package.manifest.params {
                check(
                    format!("effects.labels.{}", key_part(&param.label)),
                    &param.label,
                );
                check(
                    format!("effects.groups.{}", key_part(&param.group)),
                    &param.group,
                );
            }
        }
        assert!(missing.is_empty(), "\n{}", missing.join("\n"));
    }

    #[test]
    fn a_key_part_is_its_words_in_lower_camel_case() {
        assert_eq!(key_part("Retro & Film"), "retroAndFilm");
        assert_eq!(key_part("golden hour"), "goldenHour");
        assert_eq!(key_part("Don't {0} LUT"), "dontLut");
        assert_eq!(key_part("{x} 10-bit"), "x10Bit");
        assert_eq!(key_part(""), "");
    }

    /// A shipped package or preset reads through its key; one of the
    /// user's own reads as its author wrote it.
    #[test]
    fn manifest_words_read_through_their_keys_or_as_written() {
        let _language = language();
        let root = std::env::temp_dir().join(format!("concat-i18n-m-{}", std::process::id()));
        let dirs = AppDirs::under(&root);
        select("de", &dirs);
        assert_eq!(
            package_text("concat.exposure", "name", "Exposure"),
            "Exposure"
        );
        assert_eq!(
            package_text("alice.exposure", "name", "Exposure"),
            "Exposure"
        );
        assert_eq!(shelf_text("categories", "No such shelf"), "No such shelf");
        assert_eq!(shelf_text("groups", ""), "");
        select(ENGLISH, &dirs);
        assert_eq!(
            package_text("concat.exposure", "name", "Exposure"),
            "Exposure"
        );
        let _ = std::fs::remove_dir_all(&root);
    }

    /// Historical custom locales cannot override the English platform UI.
    #[test]
    fn custom_locales_cannot_replace_platform_interface_words() {
        let _language = language();
        let root = std::env::temp_dir().join(format!("concat-i18n-l-{}", std::process::id()));
        let dirs = AppDirs::under(&root);
        std::fs::create_dir_all(user_dir(&dirs)).expect("a locales folder");
        std::fs::write(
            user_dir(&dirs).join("de.json"),
            r#"{ "_": { "name": "Deutsch" }, "Settings": "Optionen", "common.export": "Ausgabe" }"#,
        )
        .expect("writes");
        select("de", &dirs);
        assert_eq!(current(), ENGLISH);
        assert_eq!(t("common.settings"), "Settings");
        assert_eq!(t("common.export"), "Export");
        select(ENGLISH, &dirs);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn placeholders_fill_in_order() {
        assert_eq!(fill("{1} of {0}", &[&3, &"a"]), "a of 3");
        assert_eq!(fill("plain", &[&1]), "plain");
    }

    /// A key no locale translates reads in English; one nothing lists at
    /// all reads as itself.
    #[test]
    fn a_missing_translation_reads_as_the_key() {
        let _language = language();
        let root = std::env::temp_dir().join(format!("concat-i18n-{}", std::process::id()));
        let dirs = AppDirs::under(&root);
        select("de", &dirs);
        assert_eq!(current(), ENGLISH);
        assert_eq!(t("a key nobody translated"), "a key nobody translated");
        assert_eq!(t("common.settings"), "Settings");
        select(ENGLISH, &dirs);
        assert_eq!(t("common.settings"), "Settings");
    }

    #[test]
    fn english_only_ui_ignores_saved_system_and_custom_choices_without_changing_content() {
        let _language = language();
        let root = std::env::temp_dir().join(format!("veycut-english-ui-{}", std::process::id()));
        let dirs = AppDirs::under(&root);
        std::fs::create_dir_all(user_dir(&dirs)).expect("locale folder");
        std::fs::write(user_dir(&dirs).join("en.json"),
            r#"{"_":{"name":"Custom"},"common.settings":"تنظیمات","common.export":"Custom export"}"#).expect("custom English override");
        std::fs::write(
            user_dir(&dirs).join("fa.json"),
            r#"{"_":{"name":"فارسی"},"common.settings":"تنظیمات"}"#,
        )
        .expect("custom Persian locale");
        let content = "زیرنویس فارسی — سلام دنیا";
        for remembered in ["fa", "de", "zh-TW", "customLocale", "en-US", ENGLISH] {
            select(remembered, &dirs);
            assert_eq!(current(), ENGLISH);
            assert_eq!(t("common.settings"), "Settings");
            assert_eq!(t("common.export"), "Export");
            assert_eq!(
                languages(&dirs),
                vec![Language {
                    code: ENGLISH.to_owned(),
                    name: "English".to_owned()
                }]
            );
            assert_eq!(t_or("user.authoredCaption", content), content);
            assert_eq!(
                fill("Caption: {0}", &[&content]),
                format!("Caption: {content}")
            );
        }
        assert!(
            user_dir(&dirs).join("fa.json").exists(),
            "locale resources are retained"
        );
        let _ = std::fs::remove_dir_all(root);
    }
}
