//! GitHub-only objective ASR measurement using the app's existing transcriber.
//! Copy into concat-speech/examples; args: manifest.json transcript-report.json model-dir.
use std::path::PathBuf;
use concat_host::{AppDirs, models};
use concat_speech::{Transcriber, transcribe::TranscribeRequest};

fn main() {
    let args:Vec<String> = std::env::args().collect();
    assert_eq!(args.len(),4,"manifest, report, private GitHub-run model directory");
    let manifest:serde_json::Value = serde_json::from_slice(&std::fs::read(&args[1]).unwrap()).unwrap();
    let dirs=AppDirs::under(&PathBuf::from(&args[3]));
    let transcriber=Transcriber::new();
    // The existing native KnownModel downloader pins tiny.en's upstream and
    // checksum. Verify again before inference, including cached downloads.
    transcriber.download_model(&dirs,"tiny.en", |_|{}).unwrap();
    let digest="921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f";
    models::verify(&dirs.data.join("whisper-models/ggml-tiny.en.bin"),digest).unwrap();
    let mut results=Vec::new();
    for item in manifest["requests"].as_array().unwrap() {
        let request=TranscribeRequest { path:item["path"].as_str().unwrap().into(), audio_stream:None, source_start:0.0, window:item["seconds"].as_f64().unwrap(), model_id:"tiny.en".into() };
        let segments=transcriber.transcribe(&dirs,&request, |_|{}).unwrap();
        results.push(serde_json::json!({"id":item["id"],"kind":item["kind"],"path":item["path"],"seconds":item["seconds"],"segments":segments}));
        // Persist every measurement so later failures cannot erase evidence.
        std::fs::write(&args[2],serde_json::to_vec_pretty(&serde_json::json!({"nativeSource":std::env::var("NATIVE_BASELINE_SHA").unwrap(),"model":"tiny.en","modelSHA256":digest,"recognizer":"Existing native Transcriber, local whisper.cpp","scope":"Objective machine recognition, not human listening or full intelligibility/quality equivalence","results":results})).unwrap()).unwrap();
    }
}
