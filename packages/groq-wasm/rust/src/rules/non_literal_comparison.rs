//! Comparisons between two non-literal expressions.
//!
//! Same as upstream, plus the coercions the index evaluates itself:
//! `dateTime("…")` is a literal, and `lower(^.name)` is a batch key like `^.name`.

use groq_lint::ir::{IrGraph, NodeId, NodeKind, Provenance};
use groq_lint::rules::{Hit, Rule};

use super::is_global_call;

const INDEX_COERCIONS: [&str; 2] = ["dateTime", "lower"];

pub struct NonLiteralComparison;

impl Rule for NonLiteralComparison {
    fn id(&self) -> &'static str {
        "non_literal_comparison"
    }

    fn name(&self) -> &'static str {
        "Non-Literal Comparison"
    }

    fn description(&self) -> &'static str {
        "Comparisons between two non-literal fields cannot use indices efficiently."
    }

    fn check(&self, graph: &IrGraph) -> Vec<Hit> {
        graph
            .binary_ops()
            .filter(|node| {
                matches!(&node.kind, NodeKind::Binary { op, lhs, rhs }
                    if op.is_comparison()
                        && !is_literal_or_parent(graph, *lhs)
                        && !is_literal_or_parent(graph, *rhs))
            })
            .map(|node| Hit::at(node.span))
            .collect()
    }
}

fn is_literal_or_parent(graph: &IrGraph, node_id: NodeId) -> bool {
    let node = graph.node(node_id);

    if matches!(
        node.provenance,
        Provenance::Literal
            | Provenance::Param { .. }
            | Provenance::Parent { .. }
            | Provenance::Dataset
    ) {
        return true;
    }

    match &node.kind {
        NodeKind::Literal(_)
        | NodeKind::Param { .. }
        | NodeKind::Parent { .. }
        | NodeKind::Dataset => true,
        kind if is_global_call(kind, "now") => true,
        NodeKind::FunctionCall {
            args,
            pipe_base: None,
            ..
        } if args.len() == 1
            && INDEX_COERCIONS
                .iter()
                .any(|name| is_global_call(&node.kind, name)) =>
        {
            is_literal_or_parent(graph, args[0])
        }
        NodeKind::Access { base, .. }
        | NodeKind::Join { base }
        | NodeKind::Element { base, .. }
        | NodeKind::Filter { base, .. }
        | NodeKind::Slice { base, .. }
        | NodeKind::ArrayCoerce { base }
        | NodeKind::Projection { base, .. } => is_literal_or_parent(graph, *base),
        NodeKind::Binary { lhs, rhs, .. } => {
            is_literal_or_parent(graph, *lhs) || is_literal_or_parent(graph, *rhs)
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use crate::rules::test_support::{assert_fires, assert_ok};

    const RULE: &str = "non_literal_comparison";

    #[test]
    fn two_attributes_fire() {
        assert_fires(RULE, "*[_createdAt == _updatedAt]");
        assert_fires(RULE, "*[title == slug.current]");
        assert_fires(RULE, "*[title != subtitle]");
        assert_fires(RULE, "*[foo < bar]");
    }

    #[test]
    fn literals_params_now_and_parent_are_ok() {
        assert_ok(RULE, r#"*[foo == "bar"]"#);
        assert_ok(RULE, "*[foo == $bar]");
        assert_ok(RULE, "*[foo == now()]");
        assert_ok(RULE, "*[_type == 'x']{ refs[_ref == ^._id] }");
        assert_ok(RULE, "*[_type == 'x']{ refs[foo._ref == ^.library->_id] }");
        assert_ok(RULE, r#"*[_type == 'x']{ refs[_id == "drafts." + ^._id] }"#);
        assert_ok(RULE, r#"*[foo == *[_type == "author"][0].name]"#);
        assert_ok(RULE, "*[foo == 2 + 3]");
    }

    #[test]
    fn datetime_of_literal_is_a_literal() {
        assert_ok(
            RULE,
            r#"*[_type == "book" && dateTime(_createdAt) > dateTime("2020-01-01T00:00:00Z")]"#,
        );
        assert_fires(RULE, "*[dateTime(_createdAt) > dateTime(_updatedAt)]");
    }

    #[test]
    fn coercion_of_parent_is_a_batch_key() {
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[_type == "book" && lower(title) == lower(^.name)])}"#,
        );
        assert_fires(RULE, "*[lower(title) == lower(subtitle)]");
    }
}
