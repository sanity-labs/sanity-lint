//! Function calls in a dataset filter that the planner evaluates in memory.
//!
//! Reported under the upstream `computed_value_in_filter` id, next to the
//! upstream arithmetic check. Functions the index evaluates itself, such as
//! `lower()`, `dateTime()`, `string::startsWith()`, `references()` or
//! `count(arr)`, are not listed.

use groq_lint::ir::{IrGraph, Node, NodeId, NodeKind};
use groq_lint::rules::{Hit, Rule};

use super::{in_dataset_filter, involves_parent, is_global_call};

const IN_MEMORY_FUNCTIONS: [&str; 5] = ["upper", "length", "round", "coalesce", "select"];

pub struct InMemoryFunctionInFilter;

impl Rule for InMemoryFunctionInFilter {
    fn id(&self) -> &'static str {
        "computed_value_in_filter"
    }

    fn name(&self) -> &'static str {
        "Computed Value in Filter"
    }

    fn description(&self) -> &'static str {
        "Avoid computed values (concatenation, arithmetic, etc.) in filters. Indices cannot be used."
    }

    fn check(&self, graph: &IrGraph) -> Vec<Hit> {
        graph
            .nodes()
            .filter(|node| in_dataset_filter(graph, node) && !involves_parent(graph, node.id))
            .filter_map(|node| in_memory_term(graph, node))
            .collect()
    }
}

fn in_memory_term(graph: &IrGraph, node: &Node) -> Option<Hit> {
    match &node.kind {
        NodeKind::FunctionCall { name, args, .. } => {
            if let Some(function) = IN_MEMORY_FUNCTIONS
                .iter()
                .find(|function| is_global_call(&node.kind, function))
            {
                return Some(Hit::at(node.span).with_detail(format!(
                    "`{function}()` is evaluated in memory for every candidate document."
                )));
            }
            if name == "defined" && args.len() == 1 && accesses_element(graph, args[0]) {
                return Some(Hit::at(node.span).with_detail(
                    "`defined()` of an array element is evaluated in memory for every candidate document.",
                ));
            }
            None
        }
        NodeKind::Element { base, .. } => {
            let base_node = graph.node(*base);
            let is_split = matches!(&base_node.kind, NodeKind::FunctionCall { namespace: Some(ns), name, .. }
                if ns == "string" && name == "split");
            is_split.then(|| {
                Hit::at(groq_lint::ir::Span {
                    start: base_node.span.start,
                    end: node.span.end,
                })
                .with_detail("An element of `string::split()` is evaluated in memory for every candidate document.")
            })
        }
        _ => None,
    }
}

fn accesses_element(graph: &IrGraph, node_id: NodeId) -> bool {
    match &graph.node(node_id).kind {
        NodeKind::Element { .. } => true,
        NodeKind::Access { base, .. } => accesses_element(graph, *base),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use crate::rules::test_support::{assert_fires, assert_ok, findings};

    const RULE: &str = "computed_value_in_filter";

    #[test]
    fn in_memory_functions_fire() {
        assert_eq!(
            findings(r#"*[_type == "book" && upper(title) == "X"]"#, RULE),
            vec!["upper"]
        );
        assert_fires(RULE, r#"*[_type == "book" && length(title) > 10]"#);
        assert_fires(RULE, r#"*[_type == "book" && round(rating) == 4]"#);
        assert_fires(
            RULE,
            r#"*[_type == "book" && coalesce(subtitle, title) == "X"]"#,
        );
        assert_fires(
            RULE,
            r#"*[_type == "book" && select(rating > 3 => "good", "bad") == "good"]"#,
        );
        assert_fires(RULE, r#"*[_type == "book" && defined(reviews[0])]"#);
    }

    #[test]
    fn element_of_split_fires() {
        assert_eq!(
            findings(
                r#"*[_type == "book" && string::split(title, " ")[0] == "The"]"#,
                RULE
            ),
            vec![r#"string::split(title, " ")[0]"#]
        );
    }

    #[test]
    fn arithmetic_still_fires() {
        assert_fires(RULE, "*[count > price + 1]");
    }

    #[test]
    fn index_evaluated_filters_are_ok() {
        for query in [
            r#"*[_type == "book" && lower(title) == "foo"]"#,
            r#"*[_type == "book" && string::startsWith(title, "The")]"#,
            r#"*[_type == "book" && pt::text(body) match "foo"]"#,
            r#"*[_type == "book" && count(tags) > 1]"#,
            r#"*[_type == "book" && title in ["a", "b"]]"#,
            r#"*[_type == "book" && _id in path("books.**")]"#,
            r#"*[_type == "book" && _createdAt > dateTime(now()) - 60 * 60 * 24]"#,
            r#"*[_type == "book" && references("author-1")]"#,
            r#"*[_type == "book" && "x" in tags]"#,
            r#"*[_type == "book" && defined(subtitle)]"#,
        ] {
            assert_ok(RULE, query);
        }
    }

    #[test]
    fn functions_outside_dataset_filters_are_ok() {
        assert_ok(RULE, r#"*[_type == "book"][0...10]{"t": upper(title)}"#);
        assert_ok(
            RULE,
            r#"*[_type == "book"][0...10]{"r": reviews[length(text) > 10]}"#,
        );
    }
}
