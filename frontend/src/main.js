import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const HAN_RE = /[\u4e00-\u9fff]/g;

const hanCount = (s) => (s.match(HAN_RE) || []).length;

// 与后端 pits/rules.py 同一套笔记规矩：先校验再落库，不合格一律打回。
function noteProblem(body) {
  const han = hanCount(body);
  if (han < 10 || han > 48) return `缺字：汉字须 10～48 个，当前 ${han} 个`;
  if (!body.includes("青皮村")) return "缺村名：正文须出现「青皮村」";
  if (!/\d{2}/.test(body)) return "缺鞣次：正文须含两位连续数字（如 07）";
  return "";
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

const fmt = (iso) => new Date(iso).toLocaleString("zh-CN", { hour12: false });

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    view: { type: String },
    board: { type: Object },
    picked: { type: Object },
    pitNotes: { type: Array },
    drawerDraft: { type: String },
    noteErr: { type: String },
    noteOk: { type: String },
    notes: { type: Array },
    filterPit: { type: String },
    newPit: { type: String },
    newBody: { type: String },
    editId: { type: Number },
    editBody: { type: String },
    notesErr: { type: String },
    notesOk: { type: String },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .topbar { display: flex; align-items: center; gap: 20px; background: #3d2c1e; color: #f5ead9; padding: 10px 20px; position: sticky; top: 0; z-index: 5; }
    .topbar .brand { font-weight: bold; letter-spacing: 3px; }
    .topbar nav button { background: transparent; color: #e8dcc4; border: 1px solid #6b5638; border-radius: 6px; padding: 6px 16px; cursor: pointer; }
    .topbar nav button.on { background: #8a5a2b; border-color: #8a5a2b; color: #fff; }
    .wrap { max-width: 880px; margin: 0 auto; padding: 24px 16px 50px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .badge { display: inline-block; margin-top: 6px; font-size: 0.8em; background: rgba(0, 0, 0, 0.25); border-radius: 10px; padding: 1px 8px; }
    .scrim { position: fixed; inset: 0; background: rgba(43, 33, 24, 0.4); z-index: 8; }
    .drawer { position: fixed; top: 0; right: 0; width: 360px; max-width: 94vw; height: 100vh; box-sizing: border-box; overflow-y: auto; background: #fbf6ec; z-index: 9; padding: 20px 18px 40px; box-shadow: -6px 0 24px rgba(43, 33, 24, 0.35); }
    .drawer .x { float: right; border: 0; background: transparent; font-size: 1.4em; cursor: pointer; color: #6b5a48; }
    .card { background: #fbf6ec; border: 1px solid #e2d5bd; border-radius: 8px; padding: 12px 14px; margin: 10px 0; }
    .card header { display: flex; justify-content: space-between; align-items: baseline; }
    .bar { margin: 12px 0; }
    textarea { width: 100%; box-sizing: border-box; font: inherit; padding: 8px 10px; margin: 6px 0; }
    .count { font-size: 0.85em; color: #6b5a48; margin: 2px 0 6px; }
    .count.bad { color: #9b1c1c; }
    ul.notes { list-style: none; padding: 0; margin: 12px 0 0; }
    ul.notes li { border-top: 1px dashed #cbb894; padding: 8px 0; }
    ul.notes li p { margin: 4px 0; }
    ul.notes small { color: #6b5a48; }
    .err { color: #9b1c1c; }
    .ok { color: #2f6b2f; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    label { display: block; margin: 8px 0; }
    input, button, select { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.view = "map";
    this.board = null;
    this.picked = null;
    this.pitNotes = [];
    this.drawerDraft = "";
    this.noteErr = "";
    this.noteOk = "";
    this.notes = [];
    this.filterPit = "";
    this.newPit = "";
    this.newBody = "";
    this.editId = 0;
    this.editBody = "";
    this.notesErr = "";
    this.notesOk = "";
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.ready) this.refresh();
  }

  async refresh() {
    try {
      this.board = await api("/api/board");
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || null;
      }
      if (!this.newPit && this.board.pits.length) this.newPit = String(this.board.pits[0].id);
    } catch (e) {
      this.err = e.message;
    }
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

  async showView(v) {
    this.view = v;
    this.err = "";
    if (v === "notes") await this.loadNotes();
  }

  async pick(p) {
    this.picked = p;
    this.noteErr = "";
    this.noteOk = "";
    this.drawerDraft = "";
    await this.loadPitNotes();
  }

  closeDrawer() {
    this.picked = null;
  }

  async loadPitNotes() {
    if (!this.picked) return;
    try {
      this.pitNotes = await api(`/api/notes?pit_id=${this.picked.id}`);
    } catch (ex) {
      this.noteErr = ex.message;
    }
  }

  async writePh() {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: Number(this.ph) }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async setStatus(status) {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async saveDrawerNote() {
    this.noteErr = "";
    this.noteOk = "";
    const problem = noteProblem(this.drawerDraft);
    if (problem) {
      this.noteErr = problem;
      return;
    }
    try {
      await api(`/api/pits/${this.picked.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: this.drawerDraft }),
      });
      this.drawerDraft = "";
      this.noteOk = "已存入";
      await this.loadPitNotes();
      await this.refresh();
    } catch (ex) {
      this.noteErr = ex.message;
    }
  }

  async loadNotes() {
    this.notesErr = "";
    try {
      const q = this.filterPit ? `?pit_id=${this.filterPit}` : "";
      this.notes = await api(`/api/notes${q}`);
    } catch (ex) {
      this.notesErr = ex.message;
    }
  }

  async createNote() {
    this.notesErr = "";
    this.notesOk = "";
    if (!this.newPit) {
      this.notesErr = "请先选择坑位";
      return;
    }
    const problem = noteProblem(this.newBody);
    if (problem) {
      this.notesErr = problem;
      return;
    }
    try {
      await api(`/api/pits/${this.newPit}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: this.newBody }),
      });
      this.newBody = "";
      this.notesOk = "已存入";
      await this.loadNotes();
      await this.refresh();
    } catch (ex) {
      this.notesErr = ex.message;
    }
  }

  startEdit(n) {
    this.editId = n.id;
    this.editBody = n.body;
    this.notesErr = "";
    this.notesOk = "";
  }

  cancelEdit() {
    this.editId = 0;
    this.editBody = "";
  }

  async saveEdit(n) {
    this.notesErr = "";
    this.notesOk = "";
    const problem = noteProblem(this.editBody);
    if (problem) {
      this.notesErr = problem;
      return;
    }
    try {
      await api(`/api/notes/${n.id}`, {
        method: "PUT",
        body: JSON.stringify({ body: this.editBody }),
      });
      this.editId = 0;
      this.editBody = "";
      this.notesOk = "已存入";
      await this.loadNotes();
    } catch (ex) {
      this.notesErr = ex.message;
    }
  }

  renderTopbar() {
    return html`<header class="topbar">
      <span class="brand">${this.board.yard}</span>
      <nav>
        <button class=${this.view === "map" ? "on" : ""} @click=${() => this.showView("map")}>坑位场地图</button>
        <button class=${this.view === "notes" ? "on" : ""} @click=${() => this.showView("notes")}>坑笔记</button>
      </nav>
    </header>`;
  }

  renderMap() {
    return html`<div class="wrap">
      <p class="hint">${this.board.village} · 点坑开抽屉：登记浸液酸碱度、改坑态、写坑备注。放液须最近读数 3.5～5.0</p>
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button class="pit ${p.status}" @click=${() => this.pick(p)}>
            <strong>${p.code}</strong><br />${LABELS[p.status]}
            ${p.noteCount ? html`<br /><span class="badge">${p.noteCount} 条备注</span>` : ""}
          </button>`
        )}
      </div>
      ${this.picked ? this.renderDrawer() : ""}
      ${!this.picked && this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }

  renderDrawer() {
    const p = this.picked;
    const han = hanCount(this.drawerDraft);
    return html`<div class="scrim" @click=${this.closeDrawer}></div>
      <aside class="drawer">
        <button class="x" @click=${this.closeDrawer}>×</button>
        <h3>${p.code} · ${LABELS[p.status]}</h3>
        <p>最近酸碱度：${p.latestPh ?? "无"} · ${p.sampleCount} 次</p>
        <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
        <button @click=${this.writePh}>登记酸碱度</button>
        <div>
          <button @click=${() => this.setStatus("fill")}>注液</button>
          <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
          <button @click=${() => this.setStatus("drained")}>已放液</button>
        </div>
        ${this.err ? html`<p class="err">${this.err}</p>` : ""}
        <h4>坑备注</h4>
        <textarea rows="4" placeholder="例：青皮村东一坑第07鞣次，液色转深……" .value=${this.drawerDraft} @input=${(e) => (this.drawerDraft = e.target.value)}></textarea>
        <div class="count ${han < 10 || han > 48 ? "bad" : ""}">汉字 ${han} · 须 10～48，含「青皮村」与两位鞣次数字（如 07）</div>
        <button @click=${this.saveDrawerNote}>保存备注</button>
        ${this.noteErr ? html`<p class="err">${this.noteErr}</p>` : ""}
        ${this.noteOk ? html`<p class="ok">${this.noteOk}</p>` : ""}
        <ul class="notes">
          ${this.pitNotes.map(
            (n) => html`<li><p>${n.body}</p><small>${n.author} · ${fmt(n.updatedAt)}</small></li>`
          )}
        </ul>
      </aside>`;
  }

  renderNotes() {
    const newHan = hanCount(this.newBody);
    return html`<div class="wrap">
      <h2>鞣场笔记</h2>
      <div class="bar">
        <label>按坑筛选
          <select @change=${(e) => { this.filterPit = e.target.value; this.loadNotes(); }}>
            <option value="" ?selected=${this.filterPit === ""}>全部坑位</option>
            ${this.board.pits.map(
              (p) => html`<option value=${p.id} ?selected=${this.filterPit === String(p.id)}>${p.code}</option>`
            )}
          </select>
        </label>
      </div>
      <div class="card">
        <h3>新建备注</h3>
        <label>坑位
          <select @change=${(e) => (this.newPit = e.target.value)}>
            ${this.board.pits.map(
              (p) => html`<option value=${p.id} ?selected=${this.newPit === String(p.id)}>${p.code}</option>`
            )}
          </select>
        </label>
        <textarea rows="4" placeholder="例：青皮村西二坑第03鞣次，液面平稳……" .value=${this.newBody} @input=${(e) => (this.newBody = e.target.value)}></textarea>
        <div class="count ${newHan < 10 || newHan > 48 ? "bad" : ""}">汉字 ${newHan} · 须 10～48，含「青皮村」与两位鞣次数字（如 07）</div>
        <button @click=${this.createNote}>保存备注</button>
      </div>
      ${this.notesErr ? html`<p class="err">${this.notesErr}</p>` : ""}
      ${this.notesOk ? html`<p class="ok">${this.notesOk}</p>` : ""}
      ${this.notes.length === 0 ? html`<p class="hint">暂无备注</p>` : ""}
      ${this.notes.map((n) => this.renderNoteItem(n))}
    </div>`;
  }

  renderNoteItem(n) {
    if (this.editId === n.id) {
      const han = hanCount(this.editBody);
      return html`<div class="card">
        <header><strong>${n.pitCode}</strong><small>${n.author}</small></header>
        <textarea rows="4" .value=${this.editBody} @input=${(e) => (this.editBody = e.target.value)}></textarea>
        <div class="count ${han < 10 || han > 48 ? "bad" : ""}">汉字 ${han} · 须 10～48，含「青皮村」与两位鞣次数字（如 07）</div>
        <button @click=${() => this.saveEdit(n)}>保存</button>
        <button @click=${this.cancelEdit}>取消</button>
      </div>`;
    }
    return html`<div class="card">
      <header><strong>${n.pitCode}</strong><small>${n.author} · ${fmt(n.updatedAt)}</small></header>
      <p>${n.body}</p>
      <button @click=${() => this.startEdit(n)}>编辑</button>
    </div>`;
  }

  render() {
    if (!this.ready) {
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
    if (!this.board) return html`<div class="wrap">${this.err || "装载坑位…"}</div>`;
    return html`
      ${this.renderTopbar()}
      ${this.view === "notes" ? this.renderNotes() : this.renderMap()}
    `;
  }
}

customElements.define("tan-yard", TanYard);
