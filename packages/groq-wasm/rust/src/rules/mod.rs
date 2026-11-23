//! Lint rules that replace or extend upstream groq-lint rules so findings
//! match how the Content Lake query planner executes a query.
//!
//! Upstream rules that already agree with the planner are used as-is. The
//! replacements run on the same IR and keep the upstream rule ids, so rule
//! metadata (severity, advice) and the JavaScript rule id mapping still apply.

use groq_lint::ir::{IrGraph, Node, NodeId, NodeKind, Provenance, ScopeKind};
use groq_lint::rules::{
    ComputedValueInFilter, ExtremelyLargeQuery, Finding, JoinToGetId, MatchOnId, OrderOnExpr,
    UnlimitedQuery, VeryLargeQuery,
};
use groq_lint::Linter;
use groq_parser::parser::{ParseError, Parser};

mod computed_value_in_filter;
mod count_in_correlated_subquery;
mod join_in_filter;
mod many_joins;
mod non_literal_comparison;
mod pagination;

use computed_value_in_filter::InMemoryFunctionInFilter;
use count_in_correlated_subquery::CountInCorrelatedSubquery;
use join_in_filter::JoinInFilter;
use many_joins::ManyJoins;
use non_literal_comparison::NonLiteralComparison;
use pagination::{DeepPagination, DeepPaginationParam, LargePages};

fn linter() -> Linter {
    let mut linter = Linter::new();
    linter.add_rule(Box::new(JoinInFilter));
    linter.add_rule(Box::new(JoinToGetId));
    linter.add_rule(Box::new(ComputedValueInFilter));
    linter.add_rule(Box::new(InMemoryFunctionInFilter));
    linter.add_rule(Box::new(MatchOnId));
    linter.add_rule(Box::new(OrderOnExpr));
    linter.add_rule(Box::new(DeepPagination));
    linter.add_rule(Box::new(DeepPaginationParam));
    linter.add_rule(Box::new(LargePages));
    linter.add_rule(Box::new(NonLiteralComparison));
    linter.add_rule(Box::new(UnlimitedQuery));
    linter.add_rule(Box::new(CountInCorrelatedSubquery));
    linter.add_rule(Box::new(VeryLargeQuery));
    linter.add_rule(Box::new(ExtremelyLargeQuery));
    linter.add_rule(Box::new(ManyJoins));
    linter
}

/// Lint a GROQ query string.
pub fn lint(query: &str) -> Result<Vec<Finding>, ParseError> {
    let parsed = Parser::new(query).parse()?;
    Ok(linter().lint(&parsed.expr, query.len()))
}

/// Whether `node_id` evaluates to a stream of documents read from the dataset
/// (`*`, possibly filtered, projected, ordered or sliced), as opposed to an
/// attribute of a single document.
pub(crate) fn is_document_stream(graph: &IrGraph, node_id: NodeId) -> bool {
    match &graph.node(node_id).kind {
        NodeKind::Dataset => true,
        NodeKind::Filter { base, .. }
        | NodeKind::Projection { base, .. }
        | NodeKind::Slice { base, .. }
        | NodeKind::FunctionCall {
            pipe_base: Some(base),
            ..
        } => is_document_stream(graph, *base),
        _ => false,
    }
}

/// Whether an expression references a parent scope (`^`).
pub(crate) fn involves_parent(graph: &IrGraph, node_id: NodeId) -> bool {
    let is_parent = |node: &Node| {
        matches!(node.kind, NodeKind::Parent { .. })
            || matches!(node.provenance, Provenance::Parent { .. })
    };
    is_parent(graph.node(node_id)) || graph.descendants(node_id).any(is_parent)
}

/// Whether the innermost filter enclosing `node` filters the dataset (`*`) directly.
pub(crate) fn in_dataset_filter(graph: &IrGraph, node: &Node) -> bool {
    let mut scope_id = Some(node.scope);
    while let Some(id) = scope_id {
        let scope = graph.scope(id);
        if scope.kind == ScopeKind::Filter {
            if let NodeKind::Filter { base, .. } = &graph.node(scope.introducing_node).kind {
                return matches!(graph.node(*base).kind, NodeKind::Dataset);
            }
            return false;
        }
        scope_id = scope.parent;
    }
    false
}

/// Whether `kind` is a call of the global function `name`.
pub(crate) fn is_global_call(kind: &NodeKind, name: &str) -> bool {
    matches!(kind, NodeKind::FunctionCall { name: n, namespace, .. }
        if n == name && namespace.as_deref().is_none_or(|ns| ns == "global"))
}

#[cfg(test)]
pub(crate) mod test_support {
    pub fn findings(query: &str, rule_id: &str) -> Vec<String> {
        super::lint(query)
            .expect("query should parse")
            .into_iter()
            .filter(|f| f.rule_id == rule_id)
            .map(|f| query[f.span.start..f.span.end].to_string())
            .collect()
    }

    #[track_caller]
    pub fn assert_fires(rule_id: &str, query: &str) {
        assert!(
            !findings(query, rule_id).is_empty(),
            "expected {rule_id} to fire on: {query}"
        );
    }

    #[track_caller]
    pub fn assert_ok(rule_id: &str, query: &str) {
        let hits = findings(query, rule_id);
        assert!(
            hits.is_empty(),
            "expected {rule_id} NOT to fire on: {query}, got {hits:?}"
        );
    }
}
