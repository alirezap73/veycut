// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Jareer and Concat contributors

//! The workspace's arrangement: a tree of splits and views, walked flat
//! for Slint, which has no recursion.

use crate::ui::{DockDivider, DockSide, PaneKind, SeatBox};

pub const SEAT_MIN_W: f32 = 240.0;
pub const SEAT_MIN_H: f32 = 140.0;
/// The floor that holds where the one above cannot: enough of a seat left to
/// find its corner button with, which is the only way back from a layout that
/// has been squeezed too far.
pub const SEAT_MIN_GRAB: f32 = 64.0;
/// The gutter between the halves of a split, and the margin round the lot.
pub const SEAT_GAP: f32 = 8.0;
/// The VU meters' column needs only its bars and its scale.
pub const METERS_MIN_W: f32 = 64.0;
/// The meters' share of the bottom row in the default layout: a slim
/// column beside the timeline, at its full height.
const METERS_SHARE: f32 = 0.045;

pub enum Dock {
    /// One view, filling its box.
    Leaf(PaneKind),
    /// Two nodes and the gutter between them. `columns` means side by side,
    /// which is a vertical gutter dragged left and right; `ratio` is the share
    /// of the usable extent — the box less the gutter — that the first takes.
    Split {
        columns: bool,
        ratio: f32,
        first: Box<Dock>,
        second: Box<Dock>,
    },
}

impl Dock {
    pub fn leaf(kind: PaneKind) -> Box<Dock> {
        Box::new(Dock::Leaf(kind))
    }

    /// The node a path names, following each step into the first branch or the
    /// second. A path that runs past a leaf stops there, which cannot happen
    /// for a path this module produced.
    pub fn at(&self, path: &[bool]) -> &Dock {
        let Some((step, rest)) = path.split_first() else {
            return self;
        };
        match self {
            Dock::Split { first, second, .. } => {
                if *step {
                    second.at(rest)
                } else {
                    first.at(rest)
                }
            }
            leaf => leaf,
        }
    }

    pub fn at_mut(&mut self, path: &[bool]) -> &mut Dock {
        let Some((step, rest)) = path.split_first() else {
            return self;
        };
        match self {
            Dock::Split { first, second, .. } => {
                if *step {
                    second.at_mut(rest)
                } else {
                    first.at_mut(rest)
                }
            }
            leaf => leaf,
        }
    }

    /// The path to the nth leaf, counted in the same walk `lay_out` uses — so
    /// the number a seat carries and the number a drop reports are the same
    /// number. Paths rather than indices for the editing below, because an
    /// index is invalidated by a change elsewhere in the tree and a path is
    /// only invalidated by a change on its own way down.
    pub fn leaf_path(&self, index: usize) -> Option<Vec<bool>> {
        fn walk(node: &Dock, want: usize, seen: &mut usize, path: &mut Vec<bool>) -> bool {
            match node {
                Dock::Leaf(_) => {
                    if *seen == want {
                        return true;
                    }
                    *seen += 1;
                    false
                }
                Dock::Split { first, second, .. } => {
                    path.push(false);
                    if walk(first, want, seen, path) {
                        return true;
                    }
                    path.pop();
                    path.push(true);
                    if walk(second, want, seen, path) {
                        return true;
                    }
                    path.pop();
                    false
                }
            }
        }
        let (mut seen, mut path) = (0, Vec::new());
        walk(self, index, &mut seen, &mut path).then_some(path)
    }

    /// The same for the nth split — parent before children, which is the order
    /// `lay_out` numbers the gutters in.
    pub fn split_path(&self, index: usize) -> Option<Vec<bool>> {
        fn walk(node: &Dock, want: usize, seen: &mut usize, path: &mut Vec<bool>) -> bool {
            let Dock::Split { first, second, .. } = node else {
                return false;
            };
            if *seen == want {
                return true;
            }
            *seen += 1;
            path.push(false);
            if walk(first, want, seen, path) {
                return true;
            }
            path.pop();
            path.push(true);
            if walk(second, want, seen, path) {
                return true;
            }
            path.pop();
            false
        }
        let (mut seen, mut path) = (0, Vec::new());
        walk(self, index, &mut seen, &mut path).then_some(path)
    }

    pub fn kind_at(&self, index: usize) -> Option<PaneKind> {
        match self.at(&self.leaf_path(index)?) {
            Dock::Leaf(kind) => Some(*kind),
            _ => None,
        }
    }

    /// Turn one leaf into a split, with a new view on the named side of it.
    /// Half and half: the seat being split is the only thing that knows how
    /// much room there is, and half of it is the answer that needs no rule.
    pub fn split_leaf(&mut self, path: &[bool], kind: PaneKind, side: DockSide) {
        let node = self.at_mut(path);
        let existing = Box::new(std::mem::replace(node, Dock::Leaf(kind)));
        let (columns, first, second) = match side {
            DockSide::Left => (true, Dock::leaf(kind), existing),
            DockSide::Right => (true, existing, Dock::leaf(kind)),
            DockSide::Top => (false, Dock::leaf(kind), existing),
            _ => (false, existing, Dock::leaf(kind)),
        };
        *node = Dock::Split {
            columns,
            ratio: 0.5,
            first,
            second,
        };
    }

    /// Take a leaf out, and let its sibling take the space — the split it was
    /// half of stops existing. A path with nothing above it is the whole tree,
    /// which cannot be removed: a window with no seats has nowhere to put
    /// anything back.
    pub fn remove_leaf(&mut self, path: &[bool]) {
        let Some((last, above)) = path.split_last() else {
            return;
        };
        let parent = self.at_mut(above);
        let survivor = match parent {
            Dock::Split { first, second, .. } => {
                let keep = if *last { first } else { second };
                std::mem::replace(keep.as_mut(), Dock::Leaf(PaneKind::Media))
            }
            _ => return,
        };
        *parent = survivor;
    }
}

/// The tree walked flat: a box per view, a box per gutter.
#[derive(Default)]
pub struct DockLayout {
    pub seats: Vec<SeatBox>,
    pub dividers: Vec<DockDivider>,
    /// The usable extent of each split — its box less the gutter — in the same
    /// order as `dividers`. A divider drag is a delta in pixels and a ratio is
    /// a fraction, and this is what converts between them.
    pub extents: Vec<f32>,
}

/// Width needed by a subtree containing meters, including its column
/// gutters and a reachable sibling. Other subtrees retain their saved ratios.
fn meter_min_width(node: &Dock) -> Option<f32> {
    match node {
        Dock::Leaf(PaneKind::Meters) => Some(METERS_MIN_W),
        Dock::Leaf(_) => None,
        Dock::Split {
            columns,
            first,
            second,
            ..
        } => {
            let first = meter_min_width(first);
            let second = meter_min_width(second);
            if first.is_none() && second.is_none() {
                return None;
            }
            let first = first.unwrap_or(SEAT_MIN_GRAB);
            let second = second.unwrap_or(SEAT_MIN_GRAB);
            Some(if *columns {
                first + SEAT_GAP + second
            } else {
                first.max(second)
            })
        }
    }
}

pub fn lay_out(node: &Dock, (x, y, w, h): (f32, f32, f32, f32), out: &mut DockLayout) {
    match node {
        Dock::Leaf(kind) => out.seats.push(SeatBox {
            index: out.seats.len() as i32,
            kind: *kind,
            x,
            y,
            width: w.max(0.0),
            height: h.max(0.0),
        }),
        Dock::Split {
            columns,
            ratio,
            first,
            second,
        } => {
            // The slot is taken before the children are walked, so a gutter's
            // number is its split's position in a parent-first walk — which is
            // what `split_path` counts and what a drag reports back.
            let index = out.dividers.len();
            out.dividers.push(DockDivider::default());
            out.extents.push(0.0);

            let along = if *columns { w } else { h };
            // A tiny window cannot hold a full gutter, either.
            let gap = SEAT_GAP.min(along.max(0.0));
            let usable = (along - gap).max(0.0);
            let mut head = (usable * ratio).clamp(0.0, usable);
            if *columns {
                let first_min = meter_min_width(first);
                let second_min = meter_min_width(second);
                if first_min.is_some() || second_min.is_some() {
                    let first_min = first_min.unwrap_or(SEAT_MIN_GRAB);
                    let second_min = second_min.unwrap_or(SEAT_MIN_GRAB);
                    let minimum = first_min + second_min;
                    head = if usable >= minimum {
                        head.clamp(first_min, usable - second_min)
                    } else {
                        // Neither minimum fits: shrink both sides together,
                        // keeping all seats inside the available rectangle.
                        usable * first_min / minimum
                    };
                }
            }
            out.extents[index] = usable;
            out.dividers[index] = if *columns {
                DockDivider {
                    index: index as i32,
                    columns: true,
                    x: x + head,
                    y,
                    width: gap,
                    height: h.max(0.0),
                }
            } else {
                DockDivider {
                    index: index as i32,
                    columns: false,
                    x,
                    y: y + head,
                    width: w.max(0.0),
                    height: gap,
                }
            };

            if *columns {
                lay_out(first, (x, y, head, h), out);
                lay_out(second, (x + head + gap, y, usable - head, h), out);
            } else {
                lay_out(first, (x, y, w, head), out);
                lay_out(second, (x, y + head + gap, w, usable - head), out);
            }
        }
    }
}

/// The arrangement the editor opens with: the library, the monitor and the
/// inspector across the top, the timeline along the bottom. The same three
/// shares the fixed layout carried, re-expressed as a tree — 0.31 of the width
/// to the library and 0.22 to the inspector, which is 0.319 of what is left
/// once the library has had its share.
pub fn default_dock() -> Dock {
    Dock::Split {
        columns: false,
        ratio: 0.6,
        first: Box::new(Dock::Split {
            columns: true,
            ratio: 0.31,
            first: Dock::leaf(PaneKind::Media),
            second: Box::new(Dock::Split {
                columns: true,
                ratio: 0.681,
                first: Dock::leaf(PaneKind::Preview),
                second: Dock::leaf(PaneKind::Inspector),
            }),
        }),
        // The timeline, and the VU meters in a slim column beside it.
        second: Box::new(Dock::Split {
            columns: true,
            ratio: 1.0 - METERS_SHARE,
            first: Dock::leaf(PaneKind::Timeline),
            second: Dock::leaf(PaneKind::Meters),
        }),
    }
}

/// The top edge of a row, measured down the stack from the first lane.
/// The dock a narrow window shows: the monitor over the timeline, and
/// nothing beside either. The library and the inspector are a switch away
/// on each seat - see `PaneSwitcher` - which on a phone is how they are
/// reached in every editor: one at a time, in the space the picture had.
pub fn compact_dock() -> Dock {
    Dock::Split {
        columns: false,
        ratio: 0.5,
        first: Dock::leaf(PaneKind::Preview),
        second: Dock::leaf(PaneKind::Timeline),
    }
}

pub fn row_top(heights: &[f32], row: i32) -> f32 {
    heights.iter().take(row.max(0) as usize).sum()
}

/// The row a point down the stack falls in, clamped to the stack.
pub fn row_at(heights: &[f32], y: f32) -> i32 {
    let mut top = 0.0;
    for (row, height) in heights.iter().enumerate() {
        top += height;
        if y < top {
            return row as i32;
        }
    }
    (heights.len() as i32 - 1).max(0)
}

/// The row whose top edge is nearest a point down the stack.
///
/// What a *move* wants, and not the same question as `row_at`: dragging a clip
/// halfway into the lane below should put it there, which is the rounding the
/// old `delta / lane-height` did for free back when every lane was one height.
pub fn nearest_row(heights: &[f32], y: f32) -> i32 {
    let (mut top, mut best, mut best_distance) = (0.0_f32, 0_i32, f32::MAX);
    for (row, height) in heights.iter().enumerate() {
        let distance = (top - y).abs();
        if distance < best_distance {
            best_distance = distance;
            best = row as i32;
        }
        top += height;
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_inside_and_disjoint(layout: &DockLayout, width: f32, height: f32) {
        let epsilon = 0.001;
        let bounds: Vec<(f32, f32, f32, f32)> = layout
            .seats
            .iter()
            .map(|seat| (seat.x, seat.y, seat.width, seat.height))
            .chain(
                layout
                    .dividers
                    .iter()
                    .map(|gutter| (gutter.x, gutter.y, gutter.width, gutter.height)),
            )
            .collect();
        for &(x, y, w, h) in &bounds {
            assert!(w >= 0.0 && h >= 0.0);
            assert!(x >= -epsilon && y >= -epsilon);
            assert!(x + w <= width + epsilon && y + h <= height + epsilon);
        }
        for (index, &(x, y, w, h)) in bounds.iter().enumerate() {
            for &(other_x, other_y, other_w, other_h) in &bounds[index + 1..] {
                let overlap_x = (x + w).min(other_x + other_w) - x.max(other_x);
                let overlap_y = (y + h).min(other_y + other_h) - y.max(other_y);
                assert!(
                    overlap_x <= epsilon || overlap_y <= epsilon,
                    "overlapping dock rectangles"
                );
            }
        }
    }

    #[test]
    fn default_meter_stereo_fits_at_initial_and_resized_widths() {
        // 1008px is the usable workspace in the observed 1024px window.
        for width in [240.0, 640.0, 1008.0, 1584.0] {
            let mut layout = DockLayout::default();
            lay_out(&default_dock(), (0.0, 0.0, width, 665.0), &mut layout);
            let meters = layout
                .seats
                .iter()
                .find(|seat| matches!(seat.kind, PaneKind::Meters))
                .unwrap();
            assert!(
                meters.width >= METERS_MIN_W - 0.001,
                "meters clipped at workspace width {width}"
            );
            assert_inside_and_disjoint(&layout, width, 665.0);
        }
    }

    #[test]
    fn meter_minimum_survives_nested_columns_on_either_side() {
        for meter_first in [false, true] {
            let (first, second) = if meter_first {
                (Dock::leaf(PaneKind::Meters), Dock::leaf(PaneKind::Timeline))
            } else {
                (Dock::leaf(PaneKind::Timeline), Dock::leaf(PaneKind::Meters))
            };
            let nested = Dock::Split {
                columns: true,
                ratio: 0.99,
                first,
                second,
            };
            let dock = Dock::Split {
                columns: true,
                ratio: 0.01,
                first: Box::new(nested),
                second: Dock::leaf(PaneKind::Preview),
            };
            let mut layout = DockLayout::default();
            lay_out(&dock, (0.0, 0.0, 400.0, 200.0), &mut layout);
            assert!(
                layout
                    .seats
                    .iter()
                    .all(|seat| seat.width >= SEAT_MIN_GRAB - 0.001)
            );
            assert_inside_and_disjoint(&layout, 400.0, 200.0);
        }
    }

    #[test]
    fn squeezed_workspace_has_no_negative_or_overlapping_rectangles() {
        for width in [0.0, 1.0, 4.0, 8.0, 24.0, 72.0, 128.0] {
            for height in [0.0, 1.0, 4.0, 8.0, 24.0, 140.0] {
                let mut layout = DockLayout::default();
                lay_out(&default_dock(), (0.0, 0.0, width, height), &mut layout);
                assert_inside_and_disjoint(&layout, width, height);
            }
        }
    }

    #[test]
    fn columns_without_meters_keep_their_saved_ratio() {
        let dock = Dock::Split {
            columns: true,
            ratio: 0.2,
            first: Dock::leaf(PaneKind::Media),
            second: Dock::leaf(PaneKind::Preview),
        };
        let mut layout = DockLayout::default();
        lay_out(&dock, (0.0, 0.0, 400.0, 200.0), &mut layout);
        assert!((layout.seats[0].width - 392.0 * 0.2).abs() < 0.001);
    }
}
