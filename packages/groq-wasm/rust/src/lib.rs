//! WASM bindings for GROQ linting and formatting.
//!
//! This crate wraps the Rust groq-lint and groq-format libraries,
//! exposing them to JavaScript via WebAssembly.

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// Initialize panic hook for better error messages
#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

/// A finding from the linter, serialized for JS consumption
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsFinding {
    pub rule_id: String,
    pub message: String,
    pub severity: String,
    pub start: usize,
    pub end: usize,
}

/// Lint a GROQ query and return findings as JSON.
///
/// # Arguments
/// * `query` - The GROQ query string to lint
///
/// # Returns
/// A JSON string containing an array of findings
#[wasm_bindgen]
pub fn lint(query: &str) -> Result<String, JsValue> {
    match groq_lint::lint(query) {
        Ok(findings) => {
            let js_findings: Vec<JsFinding> = findings
                .into_iter()
                .map(|f| JsFinding {
                    rule_id: f.rule_id,
                    message: f.message,
                    severity: format!("{:?}", f.severity).to_lowercase(),
                    start: f.span.start,
                    end: f.span.end,
                })
                .collect();

            serde_json::to_string(&js_findings)
                .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
        }
        Err(e) => Err(JsValue::from_str(&format!("Lint error: {}", e))),
    }
}

/// Format a GROQ query.
///
/// # Arguments
/// * `query` - The GROQ query string to format
/// * `width` - Maximum line width (default: 80)
///
/// # Returns
/// The formatted query string
#[wasm_bindgen]
pub fn format(query: &str, width: Option<usize>) -> Result<String, JsValue> {
    let width = width.unwrap_or(80);

    groq_format::format_query(query, width)
        .map_err(|e| JsValue::from_str(&format!("Format error: {:?}", e)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lint_valid_query() {
        let result = lint("*[_type == \"post\"]");
        assert!(result.is_ok());
        let findings: Vec<JsFinding> = serde_json::from_str(&result.unwrap()).unwrap();
        assert!(findings.is_empty());
    }

    #[test]
    fn test_format_query() {
        let result = format("*[_type==\"post\"]{title}", Some(80));
        assert!(result.is_ok());
    }
}
