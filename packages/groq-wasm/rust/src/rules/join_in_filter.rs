//! Joins inside a filter over documents read from the dataset.
//!
//! A join in such a filter is resolved for every candidate document and the
//! filter runs in memory. A filter over one document's attribute array inside
//! a projection (`reviews[@->title == "x"]`) has no index read to lose.

use groq_lint::ir::{IrGraph, Node, NodeKind, ScopeKind};
use groq_lint::rules::{Hit, Rule};

use super::is_document_stream;

pub struct JoinInFilter;

impl Rule for JoinInFilter {
    fn id(&self) -> &'static str {
        "join_in_filter"
    }

    fn name(&self) -> &'static str {
        "Join in Filter"
    }

    fn description(&self) -> &'static str {
        "Avoid `->` inside filters. Move the join outside and filter on a local attribute instead."
    }

    fn advice(&self) -> &'static str {
        "Avoid joins (`->`) inside filters. It prevents optimization.\n`a->b == \"c\"` can be more optimally written `a._ref in *[b == \"c\"]._id`.\n"
    }

    fn check(&self, graph: &IrGraph) -> Vec<Hit> {
        graph
            .joins()
            .filter(|join| in_document_filter(graph, join))
            .map(|join| Hit::at(join.span))
            .collect()
    }
}

/// Whether `node` is inside a filter over documents, looking through filters
/// over attribute arrays but not past a projection.
fn in_document_filter(graph: &IrGraph, node: &Node) -> bool {
    let mut scope_id = Some(node.scope);
    while let Some(id) = scope_id {
        let scope = graph.scope(id);
        match scope.kind {
            ScopeKind::Filter => {
                if let NodeKind::Filter { base, .. } = &graph.node(scope.introducing_node).kind {
                    if is_document_stream(graph, *base) {
                        return true;
                    }
                }
            }
            ScopeKind::Projection | ScopeKind::Root => return false,
            ScopeKind::FunctionArg => {}
        }
        scope_id = scope.parent;
    }
    false
}

#[cfg(test)]
mod tests {
    use crate::rules::test_support::{assert_fires, assert_ok, findings};

    const RULE: &str = "join_in_filter";

    #[test]
    fn join_in_dataset_filter_fires() {
        assert_fires(
            RULE,
            r#"*[_type == "book" && author->name == "Ada"][0...10]"#,
        );
        assert_fires(RULE, r#"*[_type == "book"][author->name == "Ada"][0...10]"#);
        assert_fires(
            RULE,
            r#"*[_type == "author"][0...3]{"books": *[_type == "book" && author->name == "Ada"]}"#,
        );
    }

    #[test]
    fn join_in_filter_after_flatten_fires() {
        assert_fires(RULE, r#"*[_type == "book"][][author->name == "x"][0...10]"#);
    }

    #[test]
    fn join_in_array_filter_inside_dataset_filter_fires() {
        assert_fires(
            RULE,
            r#"*[_type == "book" && count(reviews[@->rating > 3]) > 0][0...10]"#,
        );
    }

    #[test]
    fn join_in_attribute_array_filter_in_projection_is_ok() {
        assert_ok(
            RULE,
            r#"*[_type == "book"][0...10]{"r": reviews[@->title == "x"]}"#,
        );
        assert_ok(
            RULE,
            r#"*[_type == "book"][0...10]{"r": reviewsInline[@->name == "x"]}"#,
        );
    }

    #[test]
    fn advice_suggests_index_served_rewrite() {
        let findings = crate::rules::lint(r#"*[author->name == "Ada"][0...10]"#).unwrap();
        let finding = findings.iter().find(|f| f.rule_id == RULE).unwrap();
        assert!(finding.message.contains("a._ref in *[b == \"c\"]._id"));
        assert!(!finding.message.contains("count("));
    }

    #[test]
    fn suggested_rewrite_has_no_join_in_filter() {
        assert!(findings(
            r#"*[_type == "book" && author._ref in *[_type == "author" && name == "Ada"]._id][0...10]"#,
            RULE
        )
        .is_empty());
    }
}
