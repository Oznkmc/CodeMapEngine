"""Tree-sitter tabanlı kod ayrıştırıcı.

Bir klasördeki Python ve JavaScript/React dosyalarını tarar; dosyaları, sınıfları
ve fonksiyonları düğüm, aralarındaki ilişkileri (içerir, çağırır, içe aktarır,
bileşeni çizer) kenar olarak çıkarır.

Kullanım:
    parsed_data, relationships = CodeParser().parse_directory("/yol/repo")
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from typing import Callable, Iterator, Optional

import tree_sitter_javascript as tsjavascript
import tree_sitter_python as tspython
from tree_sitter import Language, Node, Parser

# ----------------------------------------------------------------------
# Ayarlar
# ----------------------------------------------------------------------

# Taranmaması gereken klasörler
SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", "coverage",
    "__pycache__", ".venv", "venv", ".next",
}

# Bundle/minify dosyalarını elemek için üst boyut sınırı (bayt)
MAX_FILE_SIZE = 500_000

JS_EXTENSIONS = (".js", ".jsx")

# Dillere göre farklı adlandırılan düğüm tipleri
CLASS_TYPES = {"class_definition", "class_declaration"}
FUNC_TYPES = {
    "function_definition", "function_declaration", "method_definition",
    "arrow_function", "function_expression", "function",
}
CALL_TYPES = {"call", "call_expression"}
JSX_TYPES = {"jsx_self_closing_element", "jsx_opening_element"}

IDENTIFIER_RE = re.compile(r"^[A-Za-z_$][\w$]*$")


# ----------------------------------------------------------------------
# Yardımcı veri yapıları
# ----------------------------------------------------------------------

@dataclass(frozen=True)
class _Scope:
    """Gezinti sırasında içinde bulunulan sınıf ve fonksiyon."""

    current_class: Optional[str] = None
    current_func: Optional[str] = None


@dataclass
class _FileContext:
    """Tek bir dosyanın ayrıştırılması için gereken tüm bilgiler."""

    file_path: str
    root_dir: str
    file_id: str
    source: bytes
    parsed_data: dict
    relationships: list
    seen: dict = field(default_factory=dict)

    def text(self, node: Node) -> str:
        # tree-sitter bayt konumu verir; str yerine bytes üzerinden okumak
        # Türkçe gibi ASCII dışı karakterlerde kaymayı önler.
        return self.source[node.start_byte:node.end_byte].decode("utf-8", errors="ignore")

    def add_symbol(self, kind: str, name: str) -> None:
        """'classes' veya 'functions' listesine tekrarsız ekler."""
        if name not in self.seen[kind]:
            self.seen[kind].add(name)
            self.parsed_data[kind].append(name)

    def add_relation(self, source: str, target: str, relation_type: str) -> None:
        self.relationships.append(
            {"source": source, "target": target, "relation_type": relation_type}
        )

    def caller(self, scope: _Scope) -> str:
        """Bir çağrıyı/kullanımı yapan en yakın kapsam (fonksiyon > sınıf > dosya)."""
        return scope.current_func or scope.current_class or self.file_id


# ----------------------------------------------------------------------
# Ayrıştırıcı
# ----------------------------------------------------------------------

class CodeParser:
    def __init__(self) -> None:
        self.py_parser = Parser(Language(tspython.language()))
        self.js_parser = Parser(Language(tsjavascript.language()))

        # Düğüm tipi -> işleyici
        self._handlers: dict[str, Callable[[Node, _FileContext, _Scope], _Scope]] = {
            "import_statement": self._handle_import,
            **{t: self._handle_class for t in CLASS_TYPES},
            **{t: self._handle_function for t in FUNC_TYPES},
            **{t: self._handle_call for t in CALL_TYPES},
            **{t: self._handle_jsx for t in JSX_TYPES},
        }

    # --- Genel arayüz ---------------------------------------------------

    def parse_directory(self, dir_path: str) -> tuple[dict, list]:
        """Klasördeki Python ve JavaScript/React dosyalarını tarar."""
        parsed_data = {"classes": [], "functions": []}
        relationships: list = []
        seen = {"classes": set(), "functions": set()}

        for file_path, parser in self._iter_source_files(dir_path):
            self._parse_file(file_path, dir_path, parser, parsed_data, relationships, seen)

        return parsed_data, relationships

    # --- Dosya bulma ----------------------------------------------------

    def _iter_source_files(self, dir_path: str) -> Iterator[tuple[str, Parser]]:
        for root, dirs, files in os.walk(dir_path):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]  # bu klasörlere hiç girme

            for file in files:
                parser = self._parser_for(file)
                if parser is None:
                    continue

                file_path = os.path.join(root, file)
                try:
                    if os.path.getsize(file_path) > MAX_FILE_SIZE:
                        continue
                except OSError:
                    continue

                yield file_path, parser

    def _parser_for(self, file_name: str) -> Optional[Parser]:
        if file_name.endswith(".min.js"):
            return None
        if file_name.endswith(".py"):
            return self.py_parser
        if file_name.endswith(JS_EXTENSIONS):
            return self.js_parser
        return None

    # --- Dosya ayrıştırma -----------------------------------------------

    def _parse_file(self, file_path, root_dir, parser, parsed_data, relationships, seen) -> None:
        try:
            with open(file_path, "rb") as f:
                source = f.read()
        except OSError:
            return

        # Dosya kimliği repo köküne göre göreli yol: index.js, App.js gibi
        # farklı klasörlerdeki aynı isimli dosyalar karışmaz.
        ctx = _FileContext(
            file_path=file_path,
            root_dir=root_dir,
            file_id=self._file_id(file_path, root_dir),
            source=source,
            parsed_data=parsed_data,
            relationships=relationships,
            seen=seen,
        )

        # Dosyanın kendisi de haritada bir düğümdür
        ctx.add_symbol("classes", ctx.file_id)

        try:
            tree = parser.parse(source)
            self._traverse(tree.root_node, ctx)
        except Exception as e:  # tek bir bozuk dosya tüm analizi durdurmasın
            print(f"[CodeParser] {ctx.file_id} atlandı: {e}")

    def _traverse(self, root: Node, ctx: _FileContext) -> None:
        # Özyineleme yerine yığın kullanıyoruz: çok derin AST'lerde
        # RecursionError oluşmaz.
        stack: list[tuple[Node, _Scope]] = [(root, _Scope())]

        while stack:
            node, scope = stack.pop()

            handler = self._handlers.get(node.type)
            if handler:
                scope = handler(node, ctx, scope)

            for child in reversed(node.children):
                stack.append((child, scope))

    # --- Düğüm tipine göre işleyiciler ----------------------------------
    # Her işleyici, alt düğümlere aktarılacak (güncellenmiş) kapsamı döndürür.

    def _handle_import(self, node: Node, ctx: _FileContext, scope: _Scope) -> _Scope:
        source_node = node.child_by_field_name("source")
        if not source_node:
            return scope

        import_path = ctx.text(source_node).strip("'\"")
        if not import_path.startswith("."):  # paket import'larını (react, vb.) atla
            return scope

        target = self._resolve_import(ctx.file_path, import_path, ctx.root_dir)
        if target:
            ctx.add_relation(ctx.file_id, target, "imports_file")
        return scope

    def _handle_class(self, node: Node, ctx: _FileContext, scope: _Scope) -> _Scope:
        name_node = node.child_by_field_name("name")
        if not name_node:
            return scope

        class_name = ctx.text(name_node)
        ctx.add_symbol("classes", class_name)
        ctx.add_relation(ctx.file_id, class_name, "contains")
        return _Scope(current_class=class_name, current_func=scope.current_func)

    def _handle_function(self, node: Node, ctx: _FileContext, scope: _Scope) -> _Scope:
        name_node = self._function_name_node(node)
        if not name_node:
            return scope  # isimsiz callback: kapsam değişmez

        func_name = ctx.text(name_node)
        if not IDENTIFIER_RE.match(func_name):
            return scope

        ctx.add_symbol("functions", func_name)
        ctx.add_relation(scope.current_class or ctx.file_id, func_name, "contains")
        return _Scope(current_class=scope.current_class, current_func=func_name)

    def _handle_call(self, node: Node, ctx: _FileContext, scope: _Scope) -> _Scope:
        func_node = node.child_by_field_name("function")
        if not func_node:
            return scope

        called = ctx.text(func_node).split(".")[-1]
        if IDENTIFIER_RE.match(called):
            ctx.add_relation(ctx.caller(scope), called, "calls")
        return scope

    def _handle_jsx(self, node: Node, ctx: _FileContext, scope: _Scope) -> _Scope:
        # <Header /> ve <Header>...</Header>
        name_node = node.child_by_field_name("name")
        if not name_node:
            return scope

        component = ctx.text(name_node).split(".")[0]
        # Büyük harfle başlayanlar bileşendir; div, p gibi HTML etiketleri elenir
        if component[:1].isupper() and IDENTIFIER_RE.match(component):
            ctx.add_relation(ctx.caller(scope), component, "renders_component")
        return scope

    # --- Küçük yardımcılar ----------------------------------------------

    @staticmethod
    def _function_name_node(node: Node) -> Optional[Node]:
        name_node = node.child_by_field_name("name")
        if name_node:
            return name_node

        # const App = () => {...} ve const f = function() {...}: isim üst düğümde
        parent = node.parent
        if parent is not None and parent.type == "variable_declarator":
            return parent.child_by_field_name("name")
        return None

    @staticmethod
    def _file_id(file_path: str, root_dir: str) -> str:
        return os.path.relpath(file_path, root_dir).replace(os.sep, "/")

    def _resolve_import(self, current_file: str, import_path: str, root_dir: str) -> Optional[str]:
        """'./components/Header' gibi yolu gerçek dosyaya çevirir; bulunamazsa None."""
        base = os.path.normpath(os.path.join(os.path.dirname(current_file), import_path))

        candidates = [base]
        candidates += [base + ext for ext in JS_EXTENSIONS]
        candidates += [os.path.join(base, "index" + ext) for ext in JS_EXTENSIONS]

        for candidate in candidates:
            if os.path.isfile(candidate) and candidate.endswith(JS_EXTENSIONS):
                return self._file_id(candidate, root_dir)
        return None  # .css, .json, görsel vb. ya da bulunamayan dosya: düğüm oluşturma