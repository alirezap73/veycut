// SPDX-License-Identifier: AGPL-3.0-or-later

//! Offscreen checks of the actual Slint tree, without media services or a
//! display server. GitHub retains screenshots for human layout review.

use slint::platform::software_renderer::{
    MinimalSoftwareWindow, PremultipliedRgbaColor, RepaintBufferType, TargetPixel,
};
use slint::platform::{Platform, WindowAdapter};
use slint::{ComponentHandle, PhysicalSize};
use std::rc::Rc;

struct Backend(Rc<MinimalSoftwareWindow>);
impl Platform for Backend {
    fn create_window_adapter(&self) -> Result<Rc<dyn WindowAdapter>, slint::PlatformError> {
        Ok(self.0.clone())
    }
}

#[derive(Clone, Copy, Default)]
struct Pixel([u8; 3]);
impl TargetPixel for Pixel {
    fn blend(&mut self, color: PremultipliedRgbaColor) {
        for (channel, source) in self.0.iter_mut().zip([color.red, color.green, color.blue]) {
            let background = u16::from(*channel) * u16::from(255 - color.alpha) / 255;
            *channel = (u16::from(source) + background).min(255) as u8;
        }
    }
    fn from_rgb(red: u8, green: u8, blue: u8) -> Self {
        Self([red, green, blue])
    }
}

fn capture(window: &Rc<MinimalSoftwareWindow>, name: &str, width: u32, height: u32) {
    window.set_size(PhysicalSize::new(width, height));
    let mut pixels = vec![Pixel::default(); (width * height) as usize];
    window.request_redraw();
    let rendered = window.draw_if_needed(|renderer| {
        renderer.render(&mut pixels, width as usize);
    });
    assert!(rendered, "{name} must draw");
    assert!(
        pixels.iter().any(|pixel| pixel.0 != pixels[0].0),
        "{name} must contain interface content"
    );
    if let Some(directory) = std::env::var_os("VEYCUT_ARTIFACT_DIR") {
        let directory = std::path::PathBuf::from(directory);
        std::fs::create_dir_all(&directory).expect("screenshot directory");
        let bytes: Vec<u8> = pixels.into_iter().flat_map(|pixel| pixel.0).collect();
        image::RgbImage::from_raw(width, height, bytes)
            .expect("screenshot pixels")
            .save(directory.join(format!("ui-{name}-{width}x{height}.png")))
            .expect("screenshot PNG");
    }
}

#[test]
fn project_and_caption_forms_render_at_desktop_and_phone_sizes() {
    let window = MinimalSoftwareWindow::new(RepaintBufferType::NewBuffer);
    slint::platform::set_platform(Box::new(Backend(window.clone()))).expect("offscreen backend");
    let app = crate::ui::App::new().expect("actual compiled Slint tree");
    let catalogue: serde_json::Value =
        serde_json::from_str(include_str!("../locales/en.json")).expect("English UI catalogue");
    let translations: std::collections::HashMap<String, String> = catalogue
        .as_object()
        .expect("locale object")
        .iter()
        .filter_map(|(key, value)| value.as_str().map(|text| (key.clone(), text.to_owned())))
        .collect();
    assert!(translations.contains_key("captions.createTab"));
    let words = translations.clone();
    app.global::<crate::ui::I18n>().on_lookup(move |_, key| {
        words
            .get(key.as_str())
            .cloned()
            .unwrap_or_else(|| key.to_string())
            .into()
    });
    let words = translations.clone();
    app.global::<crate::ui::I18n>()
        .on_lookup1(move |_, key, value| {
            words
                .get(key.as_str())
                .cloned()
                .unwrap_or_else(|| key.to_string())
                .replace("{0}", value.as_str())
                .into()
        });
    app.global::<crate::ui::I18n>()
        .on_lookup_upper(move |_, key| {
            translations
                .get(key.as_str())
                .cloned()
                .unwrap_or_else(|| key.to_string())
                .to_uppercase()
                .into()
        });
    app.show().expect("show offscreen window");
    for (phone, width, height) in [(false, 1400, 900), (false, 900, 600), (true, 360, 640)] {
        app.set_phone(phone);
        app.set_on_start(true);
        app.set_start(crate::ui::StartData {
            composing: true,
            name: "VeyCut test".into(),
            frame_aspect: 0.5625,
            ..Default::default()
        });
        capture(&window, "project", width, height);
        app.set_start(crate::ui::StartData::default());
        app.set_on_start(false);
        for section in 0..3 {
            app.set_captions(crate::ui::CaptionsSheetData {
                open: true,
                section,
                text: "Hello world. Another caption.".into(),
                text_count: 2,
                offset: "0.5".into(),
                ..Default::default()
            });
            capture(&window, &format!("captions-{section}"), width, height);
        }
        app.set_captions(crate::ui::CaptionsSheetData::default());
    }
}
