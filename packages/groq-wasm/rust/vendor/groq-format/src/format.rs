//! GROQ expression formatting.

use crate::doc::Doc;
use groq_parser::ast::*;

/// A formatter that tracks comment positions and emits them alongside AST nodes.
///
/// Comments are consumed in source order as we visit nodes left-to-right.
/// When formatting a list of children (object fields, array elements, etc.),
/// we check for comments between siblings and interleave them.
struct Formatter<'a> {
    source: &'a str,
    comments: &'a [Comment],
    /// Index of the next unconsumed comment.
    cursor: usize,
    /// When true, introduce additional line-break points (binary operators,
    /// filter brackets, parentheses, single-argument function calls) so that
    /// the formatter wraps more aggressively to honor the width limit.
    force_wrap: bool,
}

impl<'a> Formatter<'a> {
    fn new(source: &'a str, comments: &'a [Comment], force_wrap: bool) -> Self {
        Formatter {
            source,
            comments,
            cursor: 0,
            force_wrap,
        }
    }

    /// Take all comments whose start position is before `pos`.
    /// Returns them classified as leading or trailing based on source context.
    fn take_comments_before(&mut self, pos: usize) -> Vec<(bool, &'a Comment)> {
        let mut result = Vec::new();
        while self.cursor < self.comments.len() && self.comments[self.cursor].pos.start < pos {
            let comment = &self.comments[self.cursor];
            let trailing = is_trailing_comment(self.source, comment);
            result.push((trailing, comment));
            self.cursor += 1;
        }
        result
    }

    /// Take all remaining unconsumed comments.
    fn take_remaining_comments(&mut self) -> Vec<(bool, &'a Comment)> {
        let mut result = Vec::new();
        while self.cursor < self.comments.len() {
            let comment = &self.comments[self.cursor];
            let trailing = is_trailing_comment(self.source, comment);
            result.push((trailing, comment));
            self.cursor += 1;
        }
        result
    }

    /// Format a list of expressions (object fields, array elements, etc.),
    /// interleaving any comments that fall between elements.
    /// Format a list of child expressions with commas and comments.
    ///
    /// Returns a single Doc containing all items separated by commas,
    /// with comments interleaved in the correct positions:
    /// - Trailing comments appear after the comma: `item, // comment`
    /// - Leading comments appear on their own line before the next item.
    fn format_comma_list_with_comments(
        &mut self,
        exprs: &[Expr],
        end_pos: usize,
        as_object_field: bool,
    ) -> Doc {
        let mut parts: Vec<Doc> = Vec::new();
        // Track whether we just emitted a // line comment, which forces
        // the next item onto a new line (a // comment runs to end of line).
        let mut needs_hard_line = false;

        for (i, expr) in exprs.iter().enumerate() {
            let expr_start = expr.get_pos().start;
            let is_last = i == exprs.len() - 1;

            // Consume comments that precede this element
            let comments = self.take_comments_before(expr_start);

            for (trailing, comment) in comments {
                if trailing && !parts.is_empty() {
                    // Trailing comment on the previous item (after its comma)
                    parts.push(Doc::text(format!(" {}", comment.text)));
                    needs_hard_line = true;
                } else if !parts.is_empty() {
                    // Leading comment before this item — starts on a new line
                    parts.push(Doc::hard_line());
                    parts.push(Doc::text(&comment.text));
                    needs_hard_line = true;
                } else {
                    // Leading comment at the very start of the list
                    parts.push(Doc::text(&comment.text));
                    needs_hard_line = true;
                }
            }

            // Line break before this item (unless it's the very first thing)
            if !parts.is_empty() {
                if needs_hard_line {
                    // After a // comment, we must start a new line —
                    // a space would produce invalid syntax.
                    parts.push(Doc::hard_line());
                    needs_hard_line = false;
                } else {
                    parts.push(Doc::line());
                }
            }

            let item_doc = if as_object_field {
                self.format_object_field(expr)
            } else {
                self.format_expr(expr)
            };

            parts.push(item_doc);

            // Comma after the item (unless last)
            if !is_last {
                parts.push(Doc::text(","));
            }
        }

        // Trailing comments before the closing delimiter
        let trailing = self.take_comments_before(end_pos);
        for (is_trailing, comment) in trailing {
            if is_trailing {
                parts.push(Doc::text(format!(" {}", comment.text)));
            } else {
                parts.push(Doc::hard_line());
                parts.push(Doc::text(&comment.text));
            }
        }

        Doc::concat(parts)
    }

    fn format_expr(&mut self, expr: &Expr) -> Doc {
        match expr {
            Expr::Everything(_) => Doc::text("*"),
            Expr::This(_) => Doc::text("@"),
            Expr::Parent(_) => Doc::text("^"),
            Expr::Literal(lit) => format_literal(lit),
            Expr::Attribute(attr) => Doc::text(&attr.name),
            Expr::Param(param) => Doc::text(format!("${}", param.name)),
            Expr::Filter(filter) => {
                let lhs = self.format_expr(&filter.lhs);
                let constraint = self.format_expr(&filter.constraint.expression);
                if self.force_wrap {
                    Doc::concat([
                        lhs,
                        Doc::text("["),
                        Doc::group(Doc::concat([
                            Doc::nest(2, Doc::concat([Doc::line_or_empty(), constraint])),
                            Doc::line_or_empty(),
                        ])),
                        Doc::text("]"),
                    ])
                } else {
                    Doc::concat([
                        lhs,
                        Doc::group(Doc::concat([Doc::text("["), constraint])),
                        Doc::text("]"),
                    ])
                }
            }
            Expr::Slice(slice) => {
                let lhs = self.format_expr(&slice.lhs);
                let range = self.format_expr(&slice.range.value);
                Doc::concat([lhs, Doc::text("["), range, Doc::text("]")])
            }
            Expr::Element(elem) => {
                let lhs = self.format_expr(&elem.lhs);
                let idx = self.format_expr(&elem.idx.value);
                Doc::concat([lhs, Doc::text("["), idx, Doc::text("]")])
            }
            Expr::ArrayTraversal(at) => Doc::concat([self.format_expr(&at.expr), Doc::text("[]")]),
            Expr::Dot(dot) => self.format_dot(dot),
            Expr::Projection(proj) => {
                let lhs = self.format_expr(&proj.lhs);
                let mid_comments = self.take_comments_before(proj.object.pos.start);
                let obj = self.format_object(&proj.object);
                if mid_comments.is_empty() {
                    Doc::concat([lhs, Doc::text(" "), obj])
                } else {
                    let mut parts = vec![lhs];
                    for (_, comment) in mid_comments {
                        parts.push(Doc::text(format!(" {}", comment.text)));
                    }
                    parts.push(Doc::hard_line());
                    parts.push(obj);
                    Doc::concat(parts)
                }
            }
            Expr::Pipe(pipe) => {
                let lhs = self.format_expr(&pipe.lhs);
                let rhs = self.format_expr(&pipe.rhs);
                Doc::group(Doc::concat([
                    lhs,
                    Doc::nest(2, Doc::concat([Doc::line(), Doc::text("| "), rhs])),
                ]))
            }
            Expr::FunctionPipe(fp) => {
                let lhs = self.format_expr(&fp.lhs);
                let func = self.format_function_call(&fp.func);
                Doc::group(Doc::concat([
                    lhs,
                    Doc::nest(2, Doc::concat([Doc::line(), Doc::text("| "), func])),
                ]))
            }
            Expr::Binary(bin) => self.format_binary(bin),
            Expr::Prefix(prefix) => self.format_prefix(prefix),
            Expr::Postfix(postfix) => self.format_postfix(postfix),
            Expr::FunctionCall(func) => self.format_function_call(func),
            Expr::Array(arr) => self.format_array(arr),
            Expr::Object(obj) => self.format_object(obj),
            Expr::Group(grp) => {
                let inner = self.format_expr(&grp.expression);
                if self.force_wrap {
                    Doc::group(Doc::concat([
                        Doc::text("("),
                        Doc::nest(2, Doc::concat([Doc::line_or_empty(), inner])),
                        Doc::line_or_empty(),
                        Doc::text(")"),
                    ]))
                } else {
                    Doc::concat([Doc::text("("), inner, Doc::text(")")])
                }
            }
            Expr::Range(range) => self.format_range(range),
            Expr::Ellipsis(_) => Doc::text("..."),
            Expr::Constraint(c) => self.format_expr(&c.expression),
            Expr::Subscript(s) => self.format_expr(&s.value),
            Expr::Tuple(t) => {
                let members: Vec<Doc> = t.members.iter().map(|m| self.format_expr(m)).collect();
                let content = Doc::join(Doc::concat([Doc::text(","), Doc::line()]), members);
                Doc::concat([Doc::text("("), Doc::group(content), Doc::text(")")])
            }
        }
    }

    fn format_dot(&mut self, dot: &DotOperator) -> Doc {
        let lhs = self.format_expr(&dot.lhs);
        let rhs = self.format_expr(&dot.rhs);

        let arrow = matches!(dot.lhs.as_ref(), Expr::Postfix(post) if post.operator == Token::Arrow);

        if let Expr::Attribute(attr) = dot.rhs.as_ref()
            && !is_identifier(&attr.name)
        {
            let key = Doc::text(format!("[\"{}\"]", escape_string(&attr.name)));
            return Doc::concat([lhs, key]);
        }

        if arrow {
            return Doc::concat([lhs, rhs]);
        }

        Doc::concat([lhs, Doc::text("."), rhs])
    }

    fn format_binary(&mut self, bin: &BinaryOperator) -> Doc {
        let op = bin.operator.literal();
        let left = self.format_expr(&bin.lhs);
        let right = self.format_expr(&bin.rhs);

        if bin.operator == Token::And || bin.operator == Token::Or {
            return Doc::group(Doc::concat([
                left,
                Doc::nest(
                    2,
                    Doc::concat([Doc::line(), Doc::text(format!("{} ", op)), right]),
                ),
            ]));
        }

        if bin.operator == Token::Colon {
            return Doc::concat([left, Doc::text(": "), right]);
        }

        if self.force_wrap {
            return Doc::group(Doc::concat([
                left,
                Doc::nest(
                    2,
                    Doc::concat([Doc::line(), Doc::text(format!("{} ", op)), right]),
                ),
            ]));
        }

        Doc::concat([left, Doc::text(format!(" {} ", op)), right])
    }

    fn format_prefix(&mut self, prefix: &PrefixOperator) -> Doc {
        let op = prefix.operator.literal();
        let operand = self.format_expr(&prefix.rhs);
        Doc::concat([Doc::text(op), operand])
    }

    fn format_postfix(&mut self, postfix: &PostfixOperator) -> Doc {
        let operand = self.format_expr(&postfix.lhs);
        let op = postfix.operator.literal();

        let op_text =
            if postfix.operator == Token::AscOperator || postfix.operator == Token::DescOperator {
                format!(" {}", op)
            } else {
                op.to_string()
            };

        Doc::concat([operand, Doc::text(op_text)])
    }

    fn format_function_call(&mut self, func: &FunctionCall) -> Doc {
        let name = if func.namespace.is_empty() {
            func.name.clone()
        } else {
            format!("{}::{}", func.namespace, func.name)
        };

        if func.arguments.is_empty() {
            return Doc::text(format!("{}()", name));
        }

        let args: Vec<Doc> = func.arguments.iter().map(|a| self.format_expr(a)).collect();
        let arg_list = Doc::join(Doc::concat([Doc::text(","), Doc::line()]), args);

        if self.force_wrap {
            Doc::group(Doc::concat([
                Doc::text(format!("{}(", name)),
                Doc::nest(2, Doc::concat([Doc::line_or_empty(), arg_list])),
                Doc::line_or_empty(),
                Doc::text(")"),
            ]))
        } else {
            Doc::concat([
                Doc::text(format!("{}(", name)),
                Doc::nest(2, Doc::group(arg_list)),
                Doc::text(")"),
            ])
        }
    }

    fn format_array(&mut self, arr: &Array) -> Doc {
        if arr.expressions.is_empty() {
            return Doc::text("[]");
        }

        let content = self.format_comma_list_with_comments(&arr.expressions, arr.pos.end, false);

        Doc::group(Doc::concat([
            Doc::text("["),
            Doc::nest(2, Doc::concat([Doc::line_or_empty(), content])),
            Doc::line_or_empty(),
            Doc::text("]"),
        ]))
    }

    fn format_object(&mut self, obj: &Object) -> Doc {
        if obj.expressions.is_empty() {
            return Doc::text("{}");
        }

        let content = self.format_comma_list_with_comments(&obj.expressions, obj.pos.end, true);

        Doc::group(Doc::concat([
            Doc::text("{"),
            Doc::nest(2, Doc::concat([Doc::line(), content])),
            Doc::line(),
            Doc::text("}"),
        ]))
    }

    fn format_object_field(&mut self, expr: &Expr) -> Doc {
        match expr {
            Expr::Binary(bin) if bin.operator == Token::Colon => {
                let key = self.format_expr(&bin.lhs);
                let value = self.format_expr(&bin.rhs);
                Doc::concat([key, Doc::text(": "), value])
            }
            Expr::Attribute(attr) => Doc::text(&attr.name),
            Expr::Ellipsis(_) => Doc::text("..."),
            _ => self.format_expr(expr),
        }
    }

    fn format_range(&mut self, range: &Range) -> Doc {
        let start = self.format_expr(&range.start);
        let end = self.format_expr(&range.end);

        let op = if range.inclusive { ".." } else { "..." };

        Doc::concat([start, Doc::text(op), end])
    }

    fn format_function_definition(&mut self, func: &FunctionDefinition) -> Doc {
        let name = format!("{}::{}", func.id.namespace, func.id.name);
        let params: Vec<String> = func
            .parameters
            .iter()
            .map(|p| format!("${}", p.name))
            .collect();
        let params_str = params.join(", ");

        Doc::concat([
            Doc::text(format!("fn {}({}) = ", name, params_str)),
            self.format_expr(&func.body),
            Doc::text(";"),
        ])
    }
}

fn format_literal(lit: &Literal) -> Doc {
    match lit {
        Literal::String(s) => Doc::text(format!("\"{}\"", escape_string(&s.value))),
        Literal::Integer(i) => Doc::text(i.value.to_string()),
        Literal::Float(f) => Doc::text(format_float(f.value)),
        Literal::Boolean(b) => Doc::text(if b.value { "true" } else { "false" }),
        Literal::Null(_) => Doc::text("null"),
    }
}

/// Whether `name` can be written as a bare attribute after `.` or `->`.
fn is_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn escape_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '"' => result.push_str("\\\""),
            '\\' => result.push_str("\\\\"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            c if c.is_control() => {
                result.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => result.push(c),
        }
    }
    result
}

fn format_float(value: f64) -> String {
    let s = format!("{}", value);
    if s.contains('.') || s.contains('e') || s.contains('E') {
        s
    } else {
        format!("{}.0", s)
    }
}

/// Get the leftmost source position of an expression by walking down the left spine.
/// Many compound nodes (Projection, Filter, Pipe, etc.) have `pos` set to the
/// operator position rather than the start of the whole expression.
fn leftmost_pos(expr: &Expr) -> usize {
    match expr {
        Expr::Projection(p) => leftmost_pos(&p.lhs),
        Expr::Filter(f) => leftmost_pos(&f.lhs),
        Expr::Pipe(p) => leftmost_pos(&p.lhs),
        Expr::FunctionPipe(fp) => leftmost_pos(&fp.lhs),
        Expr::Dot(d) => leftmost_pos(&d.lhs),
        Expr::Binary(b) => leftmost_pos(&b.lhs),
        Expr::Postfix(p) => leftmost_pos(&p.lhs),
        Expr::Slice(s) => leftmost_pos(&s.lhs),
        Expr::Element(e) => leftmost_pos(&e.lhs),
        Expr::ArrayTraversal(a) => leftmost_pos(&a.expr),
        Expr::Prefix(p) => p.pos.start,
        _ => expr.get_pos().start,
    }
}

/// Determine if a comment is trailing (on the same line as preceding code).
fn is_trailing_comment(source: &str, comment: &Comment) -> bool {
    let before = &source[..comment.pos.start];
    match before.rfind('\n') {
        Some(nl_pos) => {
            let line_before_comment = &before[nl_pos + 1..];
            line_before_comment.chars().any(|c| !c.is_whitespace())
        }
        None => before.chars().any(|c| !c.is_whitespace()),
    }
}

/// Format a full parse result (function definitions + expression) as a document.
/// The `source` parameter is the original query text, used for comment placement.
/// When `force_wrap` is true, additional break points are introduced so the
/// formatter wraps more aggressively when content exceeds the width.
pub fn format_parse_result(result: &ParseResult, source: &str, force_wrap: bool) -> Doc {
    let mut fmt = Formatter::new(source, &result.comments, force_wrap);

    let mut parts: Vec<Doc> = Vec::new();

    // Format function definitions, interleaving comments
    for (i, func) in result.functions.iter().enumerate() {
        if i > 0 {
            parts.push(Doc::hard_line());
        }
        let func_start = func.pos.start;
        let comments = fmt.take_comments_before(func_start);
        for (_, comment) in &comments {
            parts.push(Doc::text(&comment.text));
            parts.push(Doc::hard_line());
        }
        parts.push(fmt.format_function_definition(func));
    }

    if !result.functions.is_empty() {
        parts.push(Doc::text("\n\n"));
    }

    // Emit any comments between function defs and the main expression
    let expr_start = leftmost_pos(&result.expr);
    let comments = fmt.take_comments_before(expr_start);
    for (_, comment) in &comments {
        parts.push(Doc::text(&comment.text));
        parts.push(Doc::hard_line());
    }

    parts.push(fmt.format_expr(&result.expr));

    // Emit any remaining comments (trailing after the expression)
    let remaining = fmt.take_remaining_comments();
    for (trailing, comment) in &remaining {
        if *trailing {
            parts.push(Doc::text(format!(" {}", comment.text)));
        } else {
            parts.push(Doc::hard_line());
            parts.push(Doc::text(&comment.text));
        }
    }

    Doc::concat(parts)
}

/// Format a GROQ expression as a document (without comment handling).
/// This is the public API for formatting a standalone expression.
pub fn format_expr(expr: &Expr) -> Doc {
    let mut fmt = Formatter::new("", &[], false);
    fmt.format_expr(expr)
}
