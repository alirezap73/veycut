// SPDX-License-Identifier: AGPL-3.0-or-later

//! Offscreen checks of the actual Slint tree, without media services or a
//! display server. GitHub retains screenshots for human layout review.

use slint::platform::software_renderer::{
    MinimalSoftwareWindow, PremultipliedRgbaColor, RepaintBufferType, TargetPixel,
};
use slint::platform::{Platform, WindowAdapter};
use slint::{ComponentHandle, PhysicalSize};
use std::cell::Cell;
use std::rc::Rc;
use std::time::Duration;

struct Backend(Rc<MinimalSoftwareWindow>, Rc<Cell<Duration>>);
impl Platform for Backend {
    fn create_window_adapter(&self) -> Result<Rc<dyn WindowAdapter>, slint::PlatformError> {
        Ok(self.0.clone())
    }
    fn duration_since_start(&self) -> Duration {
        self.1.get()
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

fn capture(
    window: &Rc<MinimalSoftwareWindow>,
    clock: &Cell<Duration>,
    name: &str,
    width: u32,
    height: u32,
) -> Vec<Pixel> {
    window.set_size(PhysicalSize::new(width, height));
    let mut pixels = vec![Pixel::default(); (width * height) as usize];
    window.request_redraw();
    // Lay out once, then settle the tab thumb and field animations before
    // retaining pixels. The clock advances without sleeping or a GUI loop.
    window.draw_if_needed(|renderer| {
        renderer.render(&mut pixels, width as usize);
    });
    clock.set(clock.get() + Duration::from_millis(250));
    slint::platform::update_timers_and_animations();
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
        let bytes: Vec<u8> = pixels.iter().flat_map(|pixel| pixel.0).collect();
        image::RgbImage::from_raw(width, height, bytes)
            .expect("screenshot pixels")
            .save(directory.join(format!("ui-{name}-{width}x{height}.png")))
            .expect("screenshot PNG");
    }
    pixels
}

#[test]
fn project_and_caption_forms_render_at_desktop_and_phone_sizes() {
    let window = MinimalSoftwareWindow::new(RepaintBufferType::NewBuffer);
    let clock = Rc::new(Cell::new(Duration::ZERO));
    slint::platform::set_platform(Box::new(Backend(window.clone(), clock.clone())))
        .expect("offscreen backend");
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
    let chips = |options: &[(&str, f32)]| {
        slint::ModelRc::new(slint::VecModel::from(
            options
                .iter()
                .map(|(label, ratio)| crate::ui::ChipOption {
                    label: (*label).into(),
                    ratio: *ratio,
                })
                .collect::<Vec<_>>(),
        ))
    };
    app.set_start_aspects(chips(&[
        ("16:9", 16.0 / 9.0),
        ("9:16", 9.0 / 16.0),
        ("1:1", 1.0),
    ]));
    app.set_start_sizes(chips(&[("720p", 0.0), ("1080p", 0.0)]));
    app.set_start_rates(chips(&[("24", 0.0), ("30", 0.0), ("60", 0.0)]));
    for (phone, width, height) in [(false, 1400, 900), (false, 900, 600), (true, 360, 640)] {
        app.set_phone(phone);
        app.set_on_start(true);
        app.set_start(crate::ui::StartData {
            composing: true,
            name: "VeyCut test".into(),
            location: "Projects".into(),
            aspect: 1,
            size: 1,
            rate: 1,
            size_readout: "1080 × 1920".into(),
            custom_width: 1080.0,
            custom_height: 1920.0,
            custom_fps: 30.0,
            rate_readout: "30/1 fps".into(),
            frame_aspect: 0.5625,
            ..Default::default()
        });
        capture(&window, &clock, "project", width, height);
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
            capture(
                &window,
                &clock,
                &format!("captions-{section}"),
                width,
                height,
            );
        }
        app.set_captions(crate::ui::CaptionsSheetData::default());
    }

    // A real tab click followed by closing/reopening must restore Create,
    // including the selected thumb, rather than keeping the old local value.
    let weak = app.as_weak();
    app.on_captions_section_changed(move |section| {
        let app = weak.upgrade().expect("live fixture");
        let mut data = app.get_captions();
        data.section = section;
        app.set_captions(data);
    });
    app.set_phone(false);
    app.set_captions(crate::ui::CaptionsSheetData {
        open: true,
        ..Default::default()
    });
    capture(&window, &clock, "captions-before-click", 1400, 900);
    let position = slint::LogicalPosition::new(860.0, 210.0);
    app.window()
        .dispatch_event(slint::platform::WindowEvent::PointerPressed {
            position,
            button: slint::platform::PointerEventButton::Left,
        });
    app.window()
        .dispatch_event(slint::platform::WindowEvent::PointerReleased {
            position,
            button: slint::platform::PointerEventButton::Left,
        });
    assert_eq!(app.get_captions().section, 2, "pointer must select Edit");
    let brightness = |pixels: &[Pixel], x: usize| {
        pixels[202 * 1400 + x]
            .0
            .iter()
            .map(|channel| u16::from(*channel))
            .sum::<u16>()
    };
    let edited = capture(&window, &clock, "captions-after-click", 1400, 900);
    assert!(
        brightness(&edited, 795) > brightness(&edited, 465),
        "Edit thumb must be selected"
    );
    app.set_captions(crate::ui::CaptionsSheetData::default());
    app.set_captions(crate::ui::CaptionsSheetData {
        open: true,
        ..Default::default()
    });
    let reopened = capture(&window, &clock, "captions-reopened", 1400, 900);
    assert!(
        brightness(&reopened, 465) > brightness(&reopened, 795),
        "Create thumb must reset on reopen"
    );
    app.set_captions(crate::ui::CaptionsSheetData::default());
}
