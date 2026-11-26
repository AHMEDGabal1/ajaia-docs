import os
import pathlib
import sys

TEST_DB = pathlib.Path(__file__).parent / "test.db"
if TEST_DB.exists():
    TEST_DB.unlink()

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["SESSION_SECRET"] = "test-secret"

sys.path.insert(0, str(pathlib.Path(__file__).parent))
