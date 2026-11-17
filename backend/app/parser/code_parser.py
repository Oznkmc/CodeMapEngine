from __future__ import annotations

from typing import TypedDict

from tree_sitter import Language, Node, Parser
import tree_sitter_python


class ParsedSymbols(TypedDict):
    functions: list[str]
    classes: list[str]


class CodeParser:
    """Extract top-level Python class and function names from source code."""

    def __init__(self) -> None:
        self._parser = Parser(Language(tree_sitter_python.language()))

    def parse(self, source: str) -> ParsedSymbols:
        """Parse Python source and return the discovered class and function names."""
        tree = self._parser.parse(source.encode("utf-8"))
        symbols: ParsedSymbols = {"functions": [], "classes": []}

        for node in tree.root_node.children:
            self._collect_symbols(node, source, symbols)

        return symbols

    def _collect_symbols(
        self, node: Node, source: str, symbols: ParsedSymbols
    ) -> None:
        """Collect definitions at every nesting level in the syntax tree."""
        if node.type == "function_definition":
            symbols["functions"].append(self._node_name(node, source))
        elif node.type == "class_definition":
            symbols["classes"].append(self._node_name(node, source))

        for child in node.children:
            self._collect_symbols(child, source, symbols)

    @staticmethod
    def _node_name(node: Node, source: str) -> str:
        """Return the identifier from a class or function definition node."""
        name_node = node.child_by_field_name("name")
        if name_node is None:
            return ""
        return source[name_node.start_byte:name_node.end_byte]
