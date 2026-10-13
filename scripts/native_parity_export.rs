//! GitHub-only driver, copied into the pinned native crate's examples directory.
//! Calls the native session, title painter, Metal compositor and exporter used by the app.
use std::{path::PathBuf, sync::atomic::AtomicBool};
use concat_host::{dirs::AppDirs, export::{self, ExportSpec, WgpuCompositor}, media, projects, session::Session, titles::Titles};
use concat_project::commands::{Command, ClipPatch, TrimEdge};
use concat_project::model::AppliedFilter;
use concat_media::VideoCodec;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    assert_eq!(args.len(), 4, "fixture directory, source PNG, font TTF");
    let root = PathBuf::from(&args[1]);
    let source = std::fs::canonicalize(&args[2]).unwrap();
    let font = std::fs::canonicalize(&args[3]).unwrap();
    let cases: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("cases.json")).unwrap()).unwrap();
    let gpu = WgpuCompositor::new().expect("Mac GPU renderer must initialize; no reference fallback");
    let adapter = format!("{:?}", gpu.adapter_info());
    assert!(adapter.contains("Metal"), "Mac comparison requires the native Metal renderer: {adapter}");
    drop(gpu);
    let mut results = Vec::new();
    for case in cases.as_array().unwrap() {
        let name = case["name"].as_str().unwrap();
        assert!(name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-'));
        for effect in case["effects"].as_array().unwrap() {
            assert!(concat_effects::Catalogue::builtin().get(effect["id"].as_str().unwrap()).is_some(), "unknown native effect cannot count as parity");
        }
        let info = projects::create(root.to_str().unwrap(), name, 640, 360, 24, 1).unwrap();
        let mut session = Session::open_info(&info).unwrap();
        session.apply(Command::AddFont { family: "Vazirmatn".into(), path: font.to_string_lossy().into_owned() }).unwrap();
        let id = session.apply(Command::AddMedia { item: media::probe(source.to_str().unwrap()).unwrap().to_new_media() }).unwrap().created_id.unwrap();
        let clip = session.apply(Command::AddClipAtFirstFree { media_id: id, start: 0.0 }).unwrap().created_id.unwrap();
        let duration = session.project().active().clips[0].duration;
        session.apply(Command::TrimClip { clip_id: clip.clone(), edge: TrimEdge::End, delta: 1.0-duration, ripple: false }).unwrap();
        let patch: ClipPatch = serde_json::from_value(serde_json::json!({"videoEffects":case["effects"],"opacity":1.0})).unwrap();
        session.apply(Command::UpdateClip { clip_id: clip, patch }).unwrap();
        if !case["text"].is_null() {
            session.apply(Command::AddTextClip { track_id: None, above: true, start: 0.0, duration: Some(1.0), offset_y: Some(0.0), style: Some(serde_json::from_value(case["text"].clone()).unwrap()) }).unwrap();
        }
        session.save(None).unwrap();
        let canonical = session.document();
        // JSON preserves integer/float spelling; the native effect model's
        // parameters are f64. Compare the exact typed treatments so 35 and
        // 35.0 agree without relaxing IDs, enabled flags, keys or values.
        let requested:Vec<AppliedFilter> = serde_json::from_value(case["effects"].clone()).unwrap();
        let retained:Vec<AppliedFilter> = serde_json::from_value(canonical["clips"][0]["videoEffects"].clone()).unwrap();
        assert_eq!(retained, requested, "native reader must retain requested effects");
        std::fs::write(root.join(format!("{name}.json")), serde_json::to_vec_pretty(&canonical).unwrap()).unwrap();
        let reopened = Session::open(session.path(), session.settings()).unwrap();
        assert_eq!(reopened.document(), canonical, "save/reopen changes fixture");
        let titles = Titles::new(&AppDirs::under(&root.join("app")));
        let painted = titles.clips(reopened.project(), 640, 360);
        if !case["text"].is_null() { assert_eq!(painted.len(), 1, "title painter cannot silently omit text"); }
        let output = root.join(format!("native-{name}.mp4"));
        let spec = ExportSpec { output: output.to_string_lossy().into_owned(), codec: VideoCodec::H264, crf: 12, preset: "ultrafast".into(), ..ExportSpec::default() };
        let request = export::request(&reopened, &spec, painted.into_iter().map(|t|t.clip).collect());
        let gpu = WgpuCompositor::new().unwrap();
        export::run_on(&request, Some(gpu), &AtomicBool::new(false), |_|{}).unwrap();
        results.push(serde_json::json!({"name":name,"adapter":adapter,"output":output,"document":canonical}));
    }
    std::fs::write(root.join("native-report.json"), serde_json::to_vec_pretty(&serde_json::json!({"nativeSource":std::env::var("NATIVE_BASELINE_SHA").unwrap(),"scope":"Released source rebuilt on GitHub Mac; native GPU exporter, not installed DMG UI proof", "results":results})).unwrap()).unwrap();
}
