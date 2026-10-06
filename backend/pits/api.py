from ninja import NinjaAPI, Schema
from ninja.errors import HttpError

from pits.auth import BearerAuth, make_token
from pits.models import Pit, PitNote, User, Yard
from pits.rules import RuleError, assert_can_set_status, latest_ph, validate_note_body

api = NinjaAPI(title="TanPit", urls_namespace="tanpit")
auth = BearerAuth()


class LoginIn(Schema):
    username: str
    password: str


class SampleIn(Schema):
    ph: float


class StatusIn(Schema):
    status: str


class NoteIn(Schema):
    body: str


def pit_json(pit: Pit) -> dict:
    return {
        "id": pit.id,
        "code": pit.code,
        "status": pit.status,
        "row": pit.row,
        "col": pit.col,
        "latestPh": latest_ph(pit),
        "sampleCount": pit.samples.count(),
        "noteCount": pit.notes.count(),
    }


def note_json(note: PitNote) -> dict:
    return {
        "id": note.id,
        "pitId": note.pit_id,
        "pitCode": note.pit.code,
        "body": note.body,
        "author": note.author,
        "createdAt": note.created_at,
        "updatedAt": note.updated_at,
    }


@api.post("/auth/login")
def login(request, payload: LoginIn):
    user = User.objects.filter(username=payload.username).first()
    if user is None or not user.check_password(payload.password):
        raise HttpError(401, "用户名或密码错误")
    return {"access_token": make_token(user.username), "user": {"username": user.username, "role": user.role}}


@api.get("/auth/me", auth=auth)
def me(request):
    user = request.auth
    return {"username": user.username, "role": user.role}


@api.get("/health")
def health(request):
    return {"status": "ok", "service": "TanPit"}


@api.get("/board", auth=auth)
def board(request):
    yard = Yard.objects.prefetch_related("pits__samples").first()
    if yard is None:
        raise HttpError(404, "尚无鞣场")
    pits = sorted(yard.pits.all(), key=lambda p: (p.row, p.col))
    return {"yard": yard.name, "village": yard.village, "pits": [pit_json(p) for p in pits]}


@api.post("/pits/{pit_id}/samples", auth=auth)
def add_sample(request, pit_id: int, payload: SampleIn):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    pit.samples.create(ph=payload.ph, operator=request.auth.username)
    pit.refresh_from_db()
    return pit_json(pit)


@api.post("/pits/{pit_id}/status", auth=auth)
def set_status(request, pit_id: int, payload: StatusIn):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    try:
        assert_can_set_status(pit, payload.status)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    pit.status = payload.status
    pit.save(update_fields=["status"])
    return pit_json(pit)


@api.get("/notes", auth=auth)
def list_notes(request, pit_id: int | None = None):
    qs = PitNote.objects.select_related("pit").order_by("-created_at", "-id")
    if pit_id is not None:
        qs = qs.filter(pit_id=pit_id)
    return [note_json(n) for n in qs]


@api.post("/pits/{pit_id}/notes", auth=auth)
def add_note(request, pit_id: int, payload: NoteIn):
    pit = Pit.objects.filter(id=pit_id).first()
    if pit is None:
        raise HttpError(404, "坑不存在")
    try:
        body = validate_note_body(payload.body)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    note = pit.notes.create(body=body, author=request.auth.username)
    return note_json(note)


@api.put("/notes/{note_id}", auth=auth)
def edit_note(request, note_id: int, payload: NoteIn):
    note = PitNote.objects.select_related("pit").filter(id=note_id).first()
    if note is None:
        raise HttpError(404, "笔记不存在")
    try:
        body = validate_note_body(payload.body)
    except RuleError as exc:
        raise HttpError(400, str(exc))
    note.body = body
    note.save(update_fields=["body", "updated_at"])
    return note_json(note)
