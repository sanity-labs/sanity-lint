//! Document algebra for pretty-printing using Wadler's algorithm.
//!
//! The document algebra consists of:
//! - Text(s): literal text
//! - Line: a potential line break (becomes newline or space depending on grouping)
//! - Nest(i, d): indent nested content by i spaces
//! - Group(d): try to fit on one line, otherwise expand
//! - Concat(d1, d2): concatenation

/// A document in Wadler's algebra.
#[derive(Debug, Clone)]
pub enum Doc {
    /// Empty document.
    Nil,
    /// Literal text.
    Text(String),
    /// A potential line break. In "flat" mode it becomes `space`; in "break" mode it becomes a newline.
    Line { space: String },
    /// Increases indentation for nested content.
    Nest { indent: usize, doc: Box<Doc> },
    /// Tries to fit content on one line; if it doesn't fit, expands lines.
    Group(Box<Doc>),
    /// Concatenation of two documents.
    Concat { left: Box<Doc>, right: Box<Doc> },
    /// A forced line break that always becomes a newline, even in flat mode.
    /// Used after line comments (`//`) where a newline is syntactically required.
    HardLine,
}

impl Doc {
    /// Create a text document.
    pub fn text(s: impl Into<String>) -> Doc {
        let s = s.into();
        if s.is_empty() { Doc::Nil } else { Doc::Text(s) }
    }

    /// Create a line break that becomes a space in flat mode.
    pub fn line() -> Doc {
        Doc::Line {
            space: " ".to_string(),
        }
    }

    /// Create a line break that becomes empty in flat mode.
    pub fn line_or_empty() -> Doc {
        Doc::Line {
            space: String::new(),
        }
    }

    /// Create a forced line break (always a newline, even in flat mode).
    /// Used after `//` comments where a newline is syntactically required.
    pub fn hard_line() -> Doc {
        Doc::HardLine
    }

    /// Nest a document with the given indentation.
    pub fn nest(indent: usize, doc: Doc) -> Doc {
        Doc::Nest {
            indent,
            doc: Box::new(doc),
        }
    }

    /// Group a document to try fitting on one line.
    pub fn group(doc: Doc) -> Doc {
        Doc::Group(Box::new(doc))
    }

    /// Concatenate multiple documents.
    pub fn concat(docs: impl IntoIterator<Item = Doc>) -> Doc {
        let mut result = Doc::Nil;
        for doc in docs {
            result = match result {
                Doc::Nil => doc,
                _ => match doc {
                    Doc::Nil => result,
                    _ => Doc::Concat {
                        left: Box::new(result),
                        right: Box::new(doc),
                    },
                },
            };
        }
        result
    }

    /// Join documents with a separator.
    pub fn join(sep: Doc, docs: Vec<Doc>) -> Doc {
        if docs.is_empty() {
            return Doc::Nil;
        }
        let mut iter = docs.into_iter();
        let mut result = iter.next().unwrap();
        for doc in iter {
            result = Doc::concat([result, sep.clone(), doc]);
        }
        result
    }
}

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Flat,
    Break,
}

#[derive(Clone)]
struct Item {
    indent: usize,
    mode: Mode,
    doc: Doc,
}

/// Render a document to a string with a given width limit.
pub fn pretty(width: usize, doc: Doc) -> String {
    let mut output = String::new();
    let mut col = 0;
    let mut items = vec![Item {
        indent: 0,
        mode: Mode::Flat,
        doc,
    }];

    while let Some(item) = items.pop() {
        match item.doc {
            Doc::Nil => {}
            Doc::Text(s) => {
                col += s.len();
                output.push_str(&s);
            }
            Doc::Line { space } => {
                if item.mode == Mode::Flat {
                    col += space.len();
                    output.push_str(&space);
                } else {
                    output.push('\n');
                    output.push_str(&spaces(item.indent));
                    col = item.indent;
                }
            }
            Doc::HardLine => {
                output.push('\n');
                output.push_str(&spaces(item.indent));
                col = item.indent;
            }
            Doc::Nest { indent, doc } => {
                items.push(Item {
                    indent: item.indent + indent,
                    mode: item.mode,
                    doc: *doc,
                });
            }
            Doc::Concat { left, right } => {
                items.push(Item {
                    indent: item.indent,
                    mode: item.mode,
                    doc: *right,
                });
                items.push(Item {
                    indent: item.indent,
                    mode: item.mode,
                    doc: *left,
                });
            }
            Doc::Group(doc) => {
                // Try flat mode first - check if it fits without cloning
                if fits_doc(width.saturating_sub(col), &doc, Mode::Flat) {
                    items.push(Item {
                        indent: item.indent,
                        mode: Mode::Flat,
                        doc: *doc,
                    });
                } else {
                    // Fall back to break mode
                    items.push(Item {
                        indent: item.indent,
                        mode: Mode::Break,
                        doc: *doc,
                    });
                }
            }
        }
    }

    output
}

/// Check if a document fits in the given width without cloning.
/// This implements a stack-based fitting algorithm similar to Wadler's but without document cloning.
fn fits_doc(width: usize, doc: &Doc, mode: Mode) -> bool {
    let mut stack = vec![(doc, mode)];
    let mut remaining_width = width;

    while let Some((current_doc, current_mode)) = stack.pop() {
        match current_doc {
            Doc::Nil => {}
            Doc::Text(s) => {
                if s.len() > remaining_width {
                    return false;
                }
                remaining_width -= s.len();
            }
            Doc::Line { space } => {
                if current_mode == Mode::Flat {
                    if space.len() > remaining_width {
                        return false;
                    }
                    remaining_width -= space.len();
                }
                // In break mode, line breaks always fit
            }
            Doc::HardLine => {
                // A hard line never fits in flat mode — forces the
                // enclosing group into break mode.
                return false;
            }
            Doc::Nest { doc, .. } => {
                // Nesting doesn't affect width calculation, just push the nested doc
                stack.push((doc, current_mode));
            }
            Doc::Concat { left, right } => {
                // Push right first (stack is LIFO), then left
                stack.push((right, current_mode));
                stack.push((left, current_mode));
            }
            Doc::Group(doc) => {
                // For groups, we try flat mode (most restrictive)
                stack.push((doc, Mode::Flat));
            }
        }
    }

    true
}

fn spaces(n: usize) -> String {
    " ".repeat(n)
}
