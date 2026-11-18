//! groq-format - Format GROQ queries with adaptive line wrapping.
//!
//! This library provides functionality to parse and format GROQ queries
//! using Wadler's "A prettier printer" algorithm for adaptive line wrapping.
//!
//! # Example
//!
//! ```
//! use groq_format::format_query;
//!
//! let query = r#"*[_type == "article"]{ title, author->name }"#;
//! let formatted = format_query(query, 80).unwrap();
//! println!("{}", formatted);
//! ```

mod doc;
mod format;

pub use doc::Doc;
pub use format::{format_expr, format_parse_result};
use groq_parser::parser::{Parser, ParserConfig};

/// Options that control how a query is formatted.
#[derive(Debug, Clone, Copy)]
pub struct FormatOptions {
    /// Maximum line width.
    pub width: usize,
    /// When true, the formatter introduces additional break points
    /// (binary operators, filter brackets, parenthesised groups,
    /// single-argument function calls) so it wraps more aggressively
    /// to honor the `width` limit. Expressions that would otherwise
    /// be emitted on a single overflowing line will be broken.
    pub force_wrap: bool,
}

impl FormatOptions {
    /// Construct options with the given width and `force_wrap = false`.
    pub fn new(width: usize) -> Self {
        FormatOptions {
            width,
            force_wrap: false,
        }
    }

    /// Enable or disable force-wrap mode.
    pub fn with_force_wrap(mut self, force_wrap: bool) -> Self {
        self.force_wrap = force_wrap;
        self
    }
}

impl Default for FormatOptions {
    fn default() -> Self {
        FormatOptions::new(DEFAULT_WIDTH)
    }
}

/// Format a GROQ query string with the given maximum line width.
///
/// # Arguments
///
/// * `query` - The GROQ query string to format
/// * `width` - Maximum line width for wrapping
///
/// # Returns
///
/// The formatted query string, or an error if parsing fails.
///
/// # Example
///
/// ```
/// use groq_format::format_query;
///
/// let formatted = format_query("*[_type==\"post\"]{title}", 80).unwrap();
/// assert_eq!(formatted, "*[_type == \"post\"] { title }");
/// ```
pub fn format_query(query: &str, width: usize) -> Result<String, FormatError> {
    format_query_with_options(query, &FormatOptions::new(width))
}

/// Format a GROQ query string using the given [`FormatOptions`].
///
/// # Example
///
/// ```
/// use groq_format::{format_query_with_options, FormatOptions};
///
/// let opts = FormatOptions::new(30).with_force_wrap(true);
/// let formatted = format_query_with_options("count(a + b + c + d + e + f + g)", &opts).unwrap();
/// assert!(formatted.contains('\n'));
/// ```
pub fn format_query_with_options(
    query: &str,
    options: &FormatOptions,
) -> Result<String, FormatError> {
    let query = query.trim();
    if query.is_empty() {
        return Err(FormatError::EmptyQuery);
    }

    let config = ParserConfig::without_param_validation().with_comments();
    let mut parser = Parser::new_with_config(query, config);
    let result = parser
        .parse()
        .map_err(|e| FormatError::Parse(e.to_string()))?;

    let doc = format_parse_result(&result, query, options.force_wrap);
    Ok(doc::pretty(options.width, doc))
}

/// Errors that can occur during formatting.
#[derive(Debug, Clone)]
pub enum FormatError {
    /// The query string was empty.
    EmptyQuery,
    /// Failed to parse the query.
    Parse(String),
}

impl std::fmt::Display for FormatError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FormatError::EmptyQuery => write!(f, "no query provided"),
            FormatError::Parse(msg) => write!(f, "parse error: {}", msg),
        }
    }
}

impl std::error::Error for FormatError {}

/// Default line width for formatting.
pub const DEFAULT_WIDTH: usize = 80;
