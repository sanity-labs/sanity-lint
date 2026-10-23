//! WASM bindings for GROQ linting and formatting.
//!
//! This crate wraps the Rust groq-lint and groq-format libraries,
//! exposing them to JavaScript via WebAssembly.

use groq_parser::parser::{ParseError, Parser};
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

/// A `$parameter` reference, serialized for JS consumption.
#[derive(Serialize, Deserialize)]
pub struct JsParamReference {
    /// Parameter name without the leading `$`.
    pub name: String,
    /// Inclusive UTF-8 byte offset of the `$`.
    pub start: usize,
    /// Exclusive UTF-8 byte offset of the end of the name.
    pub end: usize,
}

/// List every query parameter a GROQ query references, as JSON.
///
/// Returns one entry per reference, ordered by `start`. Byte offsets are
/// UTF-8 offsets into `query`; the JavaScript wrapper converts them to UTF-16
/// code unit indices. Parameters bound by a custom function (`fn ns::f($p)`)
/// are omitted inside that function's body.
#[wasm_bindgen(js_name = extractParams)]
pub fn extract_params(query: &str) -> Result<String, JsValue> {
    let references =
        param_references(query).map_err(|e| JsValue::from_str(&format!("Parse error: {}", e)))?;

    serde_json::to_string(&references)
        .map_err(|e| JsValue::from_str(&format!("Serialization error: {}", e)))
}

fn param_references(query: &str) -> Result<Vec<JsParamReference>, ParseError> {
    let parsed = Parser::new(query).parse()?;
    let mut references: Vec<JsParamReference> = parsed
        .referenced_params()
        .into_iter()
        .map(|param| JsParamReference {
            name: param.name.clone(),
            start: param.pos.start,
            end: param.pos.end,
        })
        .collect();
    references.sort_by_key(|reference| reference.start);
    Ok(references)
}

#[cfg(test)]
mod extract_params_tests {
    use super::*;

    fn references(query: &str) -> Vec<(String, usize, usize)> {
        param_references(query)
            .unwrap()
            .into_iter()
            .map(|r| (r.name, r.start, r.end))
            .collect()
    }

    #[test]
    fn test_param_references_in_source_order_with_utf8_spans() {
        assert_eq!(
            references("*[_type == $type && title == \"é\" && slug == $slug][0...$limit]"),
            vec![
                ("type".to_string(), 11, 16),
                ("slug".to_string(), 45, 50),
                ("limit".to_string(), 56, 62),
            ]
        );
    }

    #[test]
    fn test_param_references_skip_function_locals() {
        assert_eq!(
            references("fn ex::double($x) = $x * 2; *[n == ex::double($x)]"),
            vec![("x".to_string(), 46, 48)]
        );
    }

    #[test]
    fn test_param_references_parse_error() {
        assert!(param_references("*[_type == ]").is_err());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lint_valid_query() {
        // Bounded by a slice so the `unlimited_query` rule stays quiet.
        let result = lint("*[_type == \"post\"][0...10]");
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
