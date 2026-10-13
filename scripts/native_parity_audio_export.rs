//! GitHub-only native ramp/constant-speed driver for shared speech/audio fixtures.
//! Usage: native_parity_audio_export manifest.json output-directory.
//! Manifest: [{name, source, sourceIn, sourceOut, curve?, speed?, filters?}].
use std::{path::PathBuf, sync::atomic::AtomicBool};
use concat_host::{export::{self, ExportSpec, WgpuCompositor}, media, projects, session::Session};
use concat_project::commands::{Command, ClipMove, ClipPatch, TrimEdge};
use concat_media::VideoCodec;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    assert_eq!(args.len(), 3);
    let manifest: serde_json::Value = serde_json::from_slice(&std::fs::read(&args[1]).unwrap()).unwrap();
    let root = PathBuf::from(&args[2]);
    std::fs::create_dir_all(&root).unwrap();
    let run = std::env::var("GITHUB_RUN_ID").expect("server-only example requires run identity");
    let attempt = std::env::var("GITHUB_RUN_ATTEMPT").unwrap_or_else(|_| "1".into());
    assert!(run.bytes().chain(attempt.bytes()).all(|b|b.is_ascii_digit()));
    let projects_root = root.join(format!("native-audio-projects-{run}-{attempt}"));
    std::fs::create_dir_all(&projects_root).unwrap();
    let mut results = Vec::new();
    for row in manifest.as_array().unwrap() {
        let name = row["name"].as_str().unwrap();
        assert!(name.bytes().all(|b|b.is_ascii_alphanumeric() || b==b'-'));
        let source = std::fs::canonicalize(row["source"].as_str().unwrap()).unwrap();
        let info = projects::create(projects_root.to_str().unwrap(), name, 640, 360, 24, 1).unwrap();
        let mut session = Session::open_info(&info).unwrap();
        let media_id = session.apply(Command::AddMedia { item: media::probe(source.to_str().unwrap()).unwrap().to_new_media() }).unwrap().created_id.unwrap();
        let clip_id = session.apply(Command::AddClipAtFirstFree { media_id, start: 0.0 }).unwrap().created_id.unwrap();
        let first = row["sourceIn"].as_f64().unwrap();
        let last = row["sourceOut"].as_f64().unwrap();
        let duration = session.project().active().clips[0].duration;
        assert!(first>=0.0 && last>first && last<=duration+1e-6);
        session.apply(Command::TrimClip { clip_id: clip_id.clone(), edge: TrimEdge::End, delta: last-duration, ripple:false }).unwrap();
        session.apply(Command::TrimClip { clip_id: clip_id.clone(), edge: TrimEdge::Start, delta: first, ripple:false }).unwrap();
        // Start trimming moves the timeline head too; put the retained span at zero.
        session.apply(Command::MoveClips { moves:vec![ClipMove { clip_id:clip_id.clone(),start:0.0,track_id:"T1".into() }] }).unwrap();
        let patch: ClipPatch = serde_json::from_value(serde_json::json!({"preservePitch":true,"filters":row.get("filters").cloned().unwrap_or_else(||serde_json::json!([]))})).unwrap();
        session.apply(Command::UpdateClip { clip_id: clip_id.clone(), patch }).unwrap();
        if !row["curve"].is_null() {
            session.apply(Command::SetClipSpeedCurve { clip_id:clip_id.clone(), curve:Some(serde_json::from_value(row["curve"].clone()).unwrap()) }).unwrap();
        } else {
            session.apply(Command::SetClipSpeed { clip_id:clip_id.clone(), speed:row["speed"].as_f64().unwrap_or(1.0) }).unwrap();
        }
        session.save(None).unwrap();
        let document = session.document();
        std::fs::write(root.join(format!("{name}.json")), serde_json::to_vec_pretty(&document).unwrap()).unwrap();
        let reopened = Session::open(session.path(),session.settings()).unwrap();
        assert_eq!(reopened.document(),document);
        let output = root.join(format!("native-{name}.mp4"));
        let spec = ExportSpec { output:output.to_string_lossy().into_owned(), codec:VideoCodec::H264, crf:18, preset:"ultrafast".into(), ..ExportSpec::default() };
        let request = export::request(&reopened,&spec,Vec::new());
        let gpu = WgpuCompositor::new().expect("native GPU exporter required");
        let adapter = format!("{:?}",gpu.adapter_info());
        assert!(adapter.contains("Metal"), "Mac comparison requires native Metal: {adapter}");
        export::run_on(&request,Some(gpu),&AtomicBool::new(false), |_|{}).unwrap();
        results.push(serde_json::json!({"name":name,"source":source,"output":output,"adapter":adapter,"document":document}));
    }
    std::fs::write(root.join("native-audio-report.json"),serde_json::to_vec_pretty(&serde_json::json!({"nativeSource":std::env::var("NATIVE_BASELINE_SHA").unwrap(),"results":results,"scope":"Actual native Mac exporter rebuilt from immutable released source; compare speech/timing/envelope, not sample identity"})).unwrap()).unwrap();
}
