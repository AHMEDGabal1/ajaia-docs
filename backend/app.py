import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker
from starlette.middleware.sessions import SessionMiddleware


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./data.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False, default="Untitled")
    content_html = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    owner = relationship("User")
    shares = relationship("Share", back_populates="document", cascade="all, delete-orphan")


class Share(Base):
    __tablename__ = "shares"

    id = Column(Integer, primary_key=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String(10), nullable=False)

    __table_args__ = (UniqueConstraint("document_id", "user_id"),)

    document = relationship("Document", back_populates="shares")
    user = relationship("User")


WELCOME_HTML = (
    "<h1>Welcome to Ajaia Docs</h1>"
    "<p>This document was seeded so you can see <strong>bold</strong>, <em>italic</em>, "
    "<u>underline</u>, headings, and lists right away.</p>"
    "<h2>What works</h2>"
    "<ul>"
    "<li>Create, rename, and autosave documents</li>"
    "<li>Import Markdown (.md) or plain text (.txt) files</li>"
    "<li>Share a document with another seeded user as viewer or editor</li>"
    "</ul>"
    "<p>Log in as <strong>bob@example.com</strong> to see this document under "
    "&quot;Shared with me&quot; as a viewer.</p>"
)


def seed() -> None:
    with SessionLocal() as db:
        if db.query(User).count():
            return
        alice = User(email="alice@example.com", name="Alice")
        bob = User(email="bob@example.com", name="Bob")
        carol = User(email="carol@example.com", name="Carol")
        db.add_all([alice, bob, carol])
        db.flush()
        welcome = Document(owner_id=alice.id, title="Welcome to Ajaia Docs", content_html=WELCOME_HTML)
        db.add(welcome)
        db.flush()
        db.add(Share(document_id=welcome.id, user_id=bob.id, role="viewer"))
        db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    seed()
    yield


app = FastAPI(title="Ajaia Docs", lifespan=lifespan)
app.add_middleware(SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", "dev-only-secret"))


class LoginIn(BaseModel):
    email: str


class DocCreate(BaseModel):
    title: str = "Untitled"
    content_html: str = ""


class DocPatch(BaseModel):
    title: str | None = None
    content_html: str | None = None


class ShareIn(BaseModel):
    email: str
    role: str


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    uid = request.session.get("uid")
    user = db.get(User, uid) if uid else None
    if not user:
        raise HTTPException(401, "Not authenticated")
    return user


def get_doc(db: Session, user: User, doc_id: int, need: str = "view") -> tuple[Document, str]:
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc.owner_id == user.id:
        return doc, "owner"
    share = db.query(Share).filter_by(document_id=doc.id, user_id=user.id).first()
    if not share:
        raise HTTPException(403, "You don't have access to this document")
    if need == "own":
        raise HTTPException(403, "Only the owner can do that")
    if need == "edit" and share.role != "editor":
        raise HTTPException(403, "Viewers cannot edit this document")
    return doc, share.role


def user_json(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name}


def doc_summary(doc: Document, role: str, owner_name: str) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "updated_at": doc.updated_at.isoformat(),
        "role": role,
        "owner_name": owner_name,
    }


def doc_detail(doc: Document, role: str, owner: User) -> dict:
    data = {
        "id": doc.id,
        "title": doc.title,
        "content_html": doc.content_html,
        "updated_at": doc.updated_at.isoformat(),
        "role": role,
        "owner_name": owner.name,
    }
    if role == "owner":
        data["shares"] = [
            {"user_id": s.user_id, "email": s.user.email, "name": s.user.name, "role": s.role}
            for s in doc.shares
        ]
    return data


@app.get("/api/users")
def list_users(db: Session = Depends(get_db)):
    return [user_json(u) for u in db.query(User).order_by(User.id)]


@app.post("/api/auth/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(404, "No seeded user with that email")
    request.session["uid"] = user.id
    return user_json(user)


@app.post("/api/auth/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return user_json(user)


@app.get("/api/documents")
def list_documents(user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned = (
        db.query(Document)
        .filter(Document.owner_id == user.id)
        .order_by(Document.updated_at.desc())
        .all()
    )
    shared_rows = (
        db.query(Share, Document)
        .join(Document, Share.document_id == Document.id)
        .filter(Share.user_id == user.id)
        .order_by(Document.updated_at.desc())
        .all()
    )
    return {
        "owned": [doc_summary(d, "owner", user.name) for d in owned],
        "shared": [doc_summary(d, s.role, d.owner.name) for s, d in shared_rows],
    }


@app.post("/api/documents", status_code=201)
def create_document(
    body: DocCreate, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    doc = Document(
        owner_id=user.id,
        title=body.title.strip()[:200] or "Untitled",
        content_html=body.content_html or "",
    )
    db.add(doc)
    db.commit()
    return doc_detail(doc, "owner", user)


@app.get("/api/documents/{doc_id}")
def read_document(doc_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc, role = get_doc(db, user, doc_id)
    return doc_detail(doc, role, doc.owner)


@app.patch("/api/documents/{doc_id}")
def update_document(
    doc_id: int, body: DocPatch, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    doc, _ = get_doc(db, user, doc_id, need="edit")
    if body.title is None and body.content_html is None:
        raise HTTPException(400, "Nothing to update")
    if body.title is not None:
        doc.title = body.title.strip()[:200] or "Untitled"
    if body.content_html is not None:
        doc.content_html = body.content_html
    doc.updated_at = utcnow()
    db.commit()
    return {"ok": True}


@app.post("/api/documents/{doc_id}/share")
def share_document(
    doc_id: int, body: ShareIn, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    doc, _ = get_doc(db, user, doc_id, need="own")
    if body.role not in ("editor", "viewer"):
        raise HTTPException(422, "role must be 'editor' or 'viewer'")
    target = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not target:
        raise HTTPException(404, "No user with that email")
    if target.id == user.id:
        raise HTTPException(400, "You already own this document")
    share = db.query(Share).filter_by(document_id=doc.id, user_id=target.id).first()
    if share:
        share.role = body.role
    else:
        db.add(Share(document_id=doc.id, user_id=target.id, role=body.role))
    db.commit()
    return {"ok": True}


@app.delete("/api/documents/{doc_id}/share/{user_id}")
def unshare_document(
    doc_id: int, user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    doc, _ = get_doc(db, user, doc_id, need="own")
    share = db.query(Share).filter_by(document_id=doc.id, user_id=user_id).first()
    if not share:
        raise HTTPException(404, "Share not found")
    db.delete(share)
    db.commit()
    return {"ok": True}


STATIC_DIR = next(
    (
        p
        for p in (
            Path(__file__).parent / "static",
            Path(__file__).parent.parent / "frontend" / "dist",
        )
        if (p / "index.html").is_file()
    ),
    None,
)

if STATIC_DIR:
    if (STATIC_DIR / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404)
        candidate = (STATIC_DIR / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(STATIC_DIR.resolve()):
            return FileResponse(candidate)
        return FileResponse(STATIC_DIR / "index.html")

else:

    @app.get("/")
    def root():
        return {
            "service": "Ajaia Docs API",
            "hint": "Run the frontend with Vite on :5173, or build it with 'npm run build'.",
        }
