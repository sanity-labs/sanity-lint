//! count() on a correlated subquery that the planner cannot batch by key.
//!
//! A correlated subquery whose `^` conditions are all equalities
//! (`author._ref == ^._id`) or `references(^._id)` is batched: one index read
//! for every row, keyed on the parent value (or a real aggregation under a
//! single-row parent). Any other `^` condition (`>`, `<`, `in`, `match`, ...)
//! reads every document matched by the rest of the subquery once, then filters
//! that batch in memory for each row.

use groq_lint::ir::{BinaryOp, IrGraph, NodeId, NodeKind};
use groq_lint::rules::{Hit, Rule};

use super::{involves_parent, is_document_stream, is_global_call};

pub struct CountInCorrelatedSubquery;

impl Rule for CountInCorrelatedSubquery {
    fn id(&self) -> &'static str {
        "count_in_correlated_subquery"
    }

    fn name(&self) -> &'static str {
        "Count in Correlated Subquery"
    }

    fn description(&self) -> &'static str {
        "Using `count()` on a correlated subquery does not execute as an efficient aggregation."
    }

    fn advice(&self) -> &'static str {
        "Using count() on a correlated subquery whose `^` condition is not an equality or `references()` can be slow.\nEvery document matched by the rest of the subquery is read, then filtered in memory for each row.\n"
    }

    fn check(&self, graph: &IrGraph) -> Vec<Hit> {
        graph
            .function_calls()
            .filter(|node| {
                is_global_call(&node.kind, "count")
                    && matches!(&node.kind, NodeKind::FunctionCall { args, .. }
                        if args.iter().any(|&arg| has_unbatched_correlation(graph, arg)))
            })
            .map(|node| Hit::at(node.span))
            .collect()
    }
}

/// Whether a document filter in `node_id` has a `^` condition that cannot be batched.
fn has_unbatched_correlation(graph: &IrGraph, node_id: NodeId) -> bool {
    std::iter::once(graph.node(node_id))
        .chain(graph.descendants(node_id))
        .any(|node| match &node.kind {
            NodeKind::Filter {
                base, predicate, ..
            } => {
                is_document_stream(graph, *base)
                    && conjuncts(graph, *predicate)
                        .into_iter()
                        .any(|term| involves_parent(graph, term) && !is_batch_key(graph, term))
            }
            _ => false,
        })
}

fn conjuncts(graph: &IrGraph, node_id: NodeId) -> Vec<NodeId> {
    match &graph.node(node_id).kind {
        NodeKind::Binary {
            op: BinaryOp::And,
            lhs,
            rhs,
        } => {
            let mut terms = conjuncts(graph, *lhs);
            terms.extend(conjuncts(graph, *rhs));
            terms
        }
        _ => vec![node_id],
    }
}

/// `x == ^.y` (with `^` on exactly one side) or `references(^.y)`.
fn is_batch_key(graph: &IrGraph, node_id: NodeId) -> bool {
    let node = graph.node(node_id);
    match &node.kind {
        NodeKind::Binary {
            op: BinaryOp::Eq,
            lhs,
            rhs,
        } => involves_parent(graph, *lhs) != involves_parent(graph, *rhs),
        kind => is_global_call(kind, "references"),
    }
}

#[cfg(test)]
mod tests {
    use crate::rules::test_support::{assert_fires, assert_ok};

    const RULE: &str = "count_in_correlated_subquery";

    #[test]
    fn equality_on_parent_is_batched() {
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{name, "books": count(*[_type == "book" && author._ref == ^._id])}"#,
        );
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[_id == ^._id])}"#,
        );
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[^._id == author._ref])}"#,
        );
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[_type == "book" && lower(title) == lower(^.name)])}"#,
        );
    }

    #[test]
    fn references_parent_is_batched() {
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[references(^._id)])}"#,
        );
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[_type == "book" && references(^._id)])}"#,
        );
    }

    #[test]
    fn projected_ordered_or_sliced_equality_is_batched() {
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[author._ref == ^._id]{title})}"#,
        );
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[author._ref == ^._id] | order(title))}"#,
        );
        assert_ok(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[author._ref == ^._id][0...10])}"#,
        );
    }

    #[test]
    fn equality_in_filter_and_order_is_batched() {
        assert_ok(
            RULE,
            r#"*[_type == "author" && count(*[_type == "book" && author._ref == ^._id]) > 2][0...3]"#,
        );
        assert_ok(
            RULE,
            r#"*[_type == "author"] | order(count(*[_type == "book" && author._ref == ^._id]) desc)[0...3]"#,
        );
    }

    #[test]
    fn non_equality_on_parent_fires() {
        assert_fires(
            RULE,
            r#"*[_type == "book"][0...3]{"n": count(*[_type == "book" && _createdAt > ^._createdAt])}"#,
        );
        assert_fires(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[_type == "book" && ^._id in reviews[]._ref])}"#,
        );
        assert_fires(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[_type == "book" && title match ^.name])}"#,
        );
        assert_fires(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[author._ref == ^._id || editor._ref == ^._id])}"#,
        );
    }

    #[test]
    fn non_equality_after_flatten_fires() {
        assert_fires(
            RULE,
            r#"*[_type == "book"][0...3]{"n": count(*[][_createdAt > ^._createdAt])}"#,
        );
    }

    #[test]
    fn non_equality_alongside_equality_fires() {
        assert_fires(
            RULE,
            r#"*[_type == "author"][0...3]{"n": count(*[author._ref == ^._id && _createdAt > ^._createdAt])}"#,
        );
    }

    #[test]
    fn uncorrelated_count_is_ok() {
        assert_ok(RULE, r#"count(*[_type == "book"])"#);
        assert_ok(RULE, r#"*[_type == "book"][0...3]{"n": count(tags)}"#);
    }
}
