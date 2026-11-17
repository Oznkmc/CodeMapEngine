from backend.app.parser import CodeParser


SAMPLE_SOURCE = """
class UserService:
    def create_user(self, name: str) -> str:
        return name


def health_check() -> str:
    return "ok"
"""


def main() -> None:
    symbols = CodeParser().parse(SAMPLE_SOURCE)
    print(symbols)


if __name__ == "__main__":
    main()
