import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };

// 坑笔记规矩（与后端 rules.py 一致）：汉字 10～48、必带村名与两位连续数字鞣次。
const NOTE_MIN = 10;
const NOTE_MAX = 48;
const NOTE_VILLAGE = "青皮村";

function countHanzi(text) {
  return ((text || "").match(/[一-鿿]/g) || []).length;
}

function checkNote(body) {
  const text = (body || "").trim();
  const hanzi = countHanzi(text);
  if (hanzi < NOTE_MIN || hanzi > NOTE_MAX) return `坑笔记汉字须落在 ${NOTE_MIN}～${NOTE_MAX}，当前 ${hanzi} 字`;
  if (!text.includes(NOTE_VILLAGE)) return `坑笔记须写明村名「${NOTE_VILLAGE}」`;
  if (!/[0-9]{2}/.test(text)) return "坑笔记须含两位连续数字作鞣次，如 07";
  return "";
}

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "请求失败");
  return data;
}

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    view: { type: String },
    board: { type: Object },
    picked: { type: Object },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
    notes: { type: Array },
    notesFilter: { type: String },
    newNotePitId: { type: String },
    newNoteBody: { type: String },
    notesErr: { type: String },
    notesOk: { type: String },
    drawerNote: { type: String },
    drawerErr: { type: String },
    drawerOk: { type: String },
    editingId: { type: Number },
    editingBody: { type: String },
    editErr: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .topbar { display: flex; align-items: center; gap: 18px; background: #3a2c1e; color: #f3e9d7; padding: 10px 20px; }
    .brand { font-size: 1.15em; font-weight: bold; letter-spacing: 2px; }
    .topbar nav { display: flex; gap: 6px; }
    .topbar nav button { background: transparent; color: #d8c9ae; border: 1px solid #6b573f; border-radius: 6px; padding: 6px 16px; cursor: pointer; font: inherit; }
    .topbar nav button.active { background: #8a5a2b; color: #fff; border-color: #8a5a2b; }
    .wrap { max-width: 880px; margin: 0 auto; padding: 24px 16px 50px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; font: inherit; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .ok { color: #2f6b2f; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, button, select, textarea { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    textarea { width: 100%; box-sizing: border-box; min-height: 90px; border: 1px solid #b9a98f; border-radius: 6px; background: #fffdf8; }
    .overlay { position: fixed; inset: 0; background: rgba(30, 20, 10, 0.45); z-index: 10; }
    .drawer { position: fixed; top: 0; right: 0; width: 360px; max-width: 92vw; height: 100vh; box-sizing: border-box; overflow-y: auto; background: #f7f1e4; border-left: 1px solid #b9a98f; box-shadow: -4px 0 14px rgba(0, 0, 0, 0.25); padding: 18px; z-index: 11; }
    .drawer h3 { margin-top: 0; }
    .drawer .close { float: right; border: 0; background: transparent; font-size: 1.2em; cursor: pointer; }
    .notebox { border-top: 1px dashed #b9a98f; margin-top: 14px; padding-top: 10px; }
    .note { border: 1px solid #cbbfa8; border-radius: 8px; background: #fffdf8; padding: 10px 12px; margin: 10px 0; }
    .note .meta { color: #6b5a48; font-size: 0.88em; margin-bottom: 4px; }
    .note .body { white-space: pre-wrap; }
    .badge { display: inline-block; background: #8a5a2b; color: #fff; border-radius: 4px; padding: 1px 8px; margin-right: 6px; font-size: 0.85em; }
    .toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.view = "map";
    this.board = null;
    this.picked = null;
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
    this.notes = [];
    this.notesFilter = "";
    this.newNotePitId = "";
    this.newNoteBody = "";
    this.notesErr = "";
    this.notesOk = "";
    this.drawerNote = "";
    this.drawerErr = "";
    this.drawerOk = "";
    this.editingId = 0;
    this.editingBody = "";
    this.editErr = "";
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.ready) this.refresh();
  }

  async refresh() {
    try {
      this.board = await api("/api/board");
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || this.board.pits[0];
      }
    } catch (e) {
      this.err = e.message;
    }
    try {
      await this.loadNotes();
    } catch (e) {
      this.notesErr = e.message;
    }
  }

  async loadNotes() {
    const q = this.notesFilter ? `?pit_id=${this.notesFilter}` : "";
    this.notes = await api(`/api/notes${q}`);
  }

  async login(e) {
    e.preventDefault();
    this.err = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      this.ready = true;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  switchView(view) {
    this.view = view;
    this.err = "";
    if (view === "notes") {
      this.notesErr = "";
      this.notesOk = "";
      this.loadNotes().catch((e) => (this.notesErr = e.message));
    }
  }

  openDrawer(pit) {
    this.picked = pit;
    this.drawerNote = "";
    this.drawerErr = "";
    this.drawerOk = "";
  }

  closeDrawer() {
    this.picked = null;
  }

  async writePh() {
    this.err = "";
    this.drawerErr = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: Number(this.ph) }),
      });
      await this.refresh();
    } catch (ex) {
      this.drawerErr = ex.message;
    }
  }

  async setStatus(status) {
    this.err = "";
    this.drawerErr = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await this.refresh();
    } catch (ex) {
      this.drawerErr = ex.message;
    }
  }

  // 抽屉与笔记专页共用同一条保存路径：先按规矩自检，再交后端落库；
  // 只有后端确认写入才算成功，随后重新拉取列表对账。
  async submitNote(pitId, body) {
    const problem = checkNote(body);
    if (problem) return { err: problem };
    try {
      await api(`/api/pits/${pitId}/notes`, { method: "POST", body: JSON.stringify({ body }) });
    } catch (ex) {
      return { err: ex.message };
    }
    await this.refresh(); // 已落库，重新拉取列表对账
    return { ok: true };
  }

  async saveDrawerNote() {
    this.drawerErr = "";
    this.drawerOk = "";
    const r = await this.submitNote(this.picked.id, this.drawerNote);
    if (r.err) {
      this.drawerErr = r.err;
    } else {
      this.drawerNote = "";
      this.drawerOk = "已落库";
    }
  }

  async saveNewNote() {
    this.notesErr = "";
    this.notesOk = "";
    const pitId = this.newNotePitId || this.notesFilter || (this.board?.pits[0]?.id ?? "");
    if (!pitId) {
      this.notesErr = "请先选坑";
      return;
    }
    const r = await this.submitNote(pitId, this.newNoteBody);
    if (r.err) {
      this.notesErr = r.err;
    } else {
      this.newNoteBody = "";
      this.notesOk = "已落库";
    }
  }

  startEdit(note) {
    this.editingId = note.id;
    this.editingBody = note.body;
    this.editErr = "";
    this.notesOk = "";
  }

  cancelEdit() {
    this.editingId = 0;
    this.editingBody = "";
    this.editErr = "";
  }

  async saveEdit(note) {
    this.editErr = "";
    this.notesOk = "";
    const problem = checkNote(this.editingBody);
    if (problem) {
      this.editErr = problem;
      return;
    }
    try {
      await api(`/api/notes/${note.id}`, { method: "PUT", body: JSON.stringify({ body: this.editingBody }) });
      this.cancelEdit();
      await this.refresh();
      this.notesOk = "已落库";
    } catch (ex) {
      this.editErr = ex.message;
    }
  }

  renderLogin() {
    return html`<div class="wrap">
      <h1>南冈鞣场</h1>
      <form @submit=${this.login} autocomplete="off">
        <label>用户名
          <input name="username" autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
        </label>
        <label>密码
          <input name="password" type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
        </label>
        <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
        <button>登录</button>
      </form>
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }

  renderTopbar() {
    return html`<header class="topbar">
      <span class="brand">${this.board?.yard || "南冈鞣场"}</span>
      <nav>
        <button class=${this.view === "map" ? "active" : ""} @click=${() => this.switchView("map")}>坑位场地图</button>
        <button class=${this.view === "notes" ? "active" : ""} @click=${() => this.switchView("notes")}>坑笔记</button>
      </nav>
    </header>`;
  }

  renderMap() {
    return html`<div class="wrap">
      <p>${this.board.village} · 点坑登记浸液酸碱度；放液须最近读数 3.5～5.0</p>
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button class="pit ${p.status}" @click=${() => this.openDrawer(p)}>
            <strong>${p.code}</strong><br />${LABELS[p.status]}<br />
            <small>笔记 ${p.noteCount} 条</small>
          </button>`
        )}
      </div>
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>
    ${this.picked ? this.renderDrawer() : ""}`;
  }

  renderDrawer() {
    const p = this.picked;
    return html`<div class="overlay" @click=${this.closeDrawer}></div>
      <aside class="drawer">
        <button class="close" @click=${this.closeDrawer}>✕</button>
        <h3>${p.code} · ${LABELS[p.status]}</h3>
        <p>最近酸碱度：${p.latestPh ?? "无"} · ${p.sampleCount} 次</p>
        <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
        <button @click=${this.writePh}>登记酸碱度</button>
        <div>
          <button @click=${() => this.setStatus("fill")}>注液</button>
          <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
          <button @click=${() => this.setStatus("drained")}>已放液</button>
        </div>
        <div class="notebox">
          <h4>坑备注</h4>
          <p class="hint">汉字 10～48，须带「青皮村」与两位鞣次（如 07）。当前 ${countHanzi(this.drawerNote)} 字。</p>
          <textarea .value=${this.drawerNote} @input=${(e) => (this.drawerNote = e.target.value)} placeholder="例：青皮村本坑第07鞣次，皮张翻动均匀，液色正常。"></textarea>
          <button @click=${this.saveDrawerNote}>保存备注</button>
          ${this.drawerErr ? html`<p class="err">${this.drawerErr}</p>` : ""}
          ${this.drawerOk ? html`<p class="ok">${this.drawerOk}</p>` : ""}
        </div>
      </aside>`;
  }

  renderNotes() {
    const pits = this.board.pits;
    const defaultPit = this.newNotePitId || this.notesFilter || (pits[0] ? String(pits[0].id) : "");
    return html`<div class="wrap">
      <div class="toolbar">
        <label>按坑筛选
          <select .value=${this.notesFilter} @change=${(e) => { this.notesFilter = e.target.value; this.loadNotes(); }}>
            <option value="">全部坑位</option>
            ${pits.map((p) => html`<option value=${p.id} ?selected=${String(p.id) === this.notesFilter}>${p.code}</option>`)}
          </select>
        </label>
        <span class="hint">共 ${this.notes.length} 条</span>
      </div>

      <section class="note">
        <h4>新建坑笔记</h4>
        <label>坑位
          <select .value=${defaultPit} @change=${(e) => (this.newNotePitId = e.target.value)}>
            ${pits.map((p) => html`<option value=${p.id} ?selected=${String(p.id) === defaultPit}>${p.code}</option>`)}
          </select>
        </label>
        <p class="hint">汉字 10～48，须带「青皮村」与两位鞣次（如 07）。当前 ${countHanzi(this.newNoteBody)} 字。</p>
        <textarea .value=${this.newNoteBody} @input=${(e) => (this.newNoteBody = e.target.value)} placeholder="例：青皮村本坑第07鞣次，皮张翻动均匀，液色正常。"></textarea>
        <button @click=${this.saveNewNote}>保存备注</button>
        ${this.notesErr ? html`<p class="err">${this.notesErr}</p>` : ""}
        ${this.notesOk ? html`<p class="ok">${this.notesOk}</p>` : ""}
      </section>

      ${this.notes.map((n) =>
        this.editingId === n.id
          ? html`<section class="note">
              <p class="meta"><span class="badge">${n.pitCode}</span>${n.author} · ${fmtTime(n.createdAt)}</p>
              <p class="hint">汉字 10～48，须带「青皮村」与两位鞣次（如 07）。当前 ${countHanzi(this.editingBody)} 字。</p>
              <textarea .value=${this.editingBody} @input=${(e) => (this.editingBody = e.target.value)}></textarea>
              <button @click=${() => this.saveEdit(n)}>保存</button>
              <button @click=${this.cancelEdit}>取消</button>
              ${this.editErr ? html`<p class="err">${this.editErr}</p>` : ""}
            </section>`
          : html`<section class="note">
              <p class="meta"><span class="badge">${n.pitCode}</span>${n.author} · ${fmtTime(n.createdAt)}</p>
              <p class="body">${n.body}</p>
              <button @click=${() => this.startEdit(n)}>编辑</button>
            </section>`
      )}
      ${this.notes.length === 0 ? html`<p class="hint">暂无笔记</p>` : ""}
    </div>`;
  }

  render() {
    if (!this.ready) return this.renderLogin();
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`${this.renderTopbar()}${this.view === "map" ? this.renderMap() : this.renderNotes()}`;
  }
}

customElements.define("tan-yard", TanYard);
