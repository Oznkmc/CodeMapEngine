import unittest

from backend.app.parser import CodeParser


class CodeParserTests(unittest.TestCase):
    def test_extracts_top_level_classes_and_functions(self) -> None:
        source = """
class User:
    def save(self):
        pass


def health_check():
    pass
"""

        self.assertEqual(
            CodeParser().parse(source),
            {"functions": ["save", "health_check"], "classes": ["User"]},
        )

    def test_handles_invalid_python_without_failing(self) -> None:
        symbols = CodeParser().parse("class User:\n    def broken(\n")

        self.assertEqual(symbols["classes"], ["User"])


if __name__ == "__main__":
    unittest.main()
