/**
 * PIN Action Card for Home Assistant
 * Protect a dashboard action (navigate, perform-action, toggle, url, more-info, ...)
 * and/or an inner card behind a PIN keypad.
 *
 * NOTE: PIN codes are stored in the dashboard config and checked in the browser.
 * This is a convenience lock, not real security.
 */

const CARD_VERSION = "1.1.0";

const DEFAULTS = {
  title: "PIN Lock",
  mask_input: true,
  auto_submit: false,
  relock_seconds: 60,
  max_width: "360px",
  max_attempts: 0,
  lockout_seconds: 30,
  success_message: "Unlocked",
  error_message: "Wrong PIN",
  placeholder: "Enter PIN",
};

const KEYS = [
  { key: "1", text: "1" }, { key: "2", text: "2" }, { key: "3", text: "3" },
  { key: "4", text: "4" }, { key: "5", text: "5" }, { key: "6", text: "6" },
  { key: "7", text: "7" }, { key: "8", text: "8" }, { key: "9", text: "9" },
  { key: "back", text: "⌫", label: "Backspace", cls: "fn" },
  { key: "0", text: "0" },
  { key: "ok", text: "OK", label: "Submit", cls: "ok" },
];

const fireEvent = (node, type, detail = {}) => {
  const ev = new Event(type, { bubbles: true, composed: true, cancelable: false });
  ev.detail = detail;
  node.dispatchEvent(ev);
  return ev;
};

const navigate = (path, replace = false) => {
  if (!path) return;
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  fireEvent(window, "location-changed", { replace });
};

const toCssWidth = (v) => {
  if (v === "" || v === null || v === undefined) return "none";
  if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) return `${v}px`;
  return String(v);
};

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

const haRoot = () => document.querySelector("home-assistant");

const stripQuery = (p) => String(p).split(/[?#]/)[0].replace(/\/+$/, "") || "/";

const onPath = (prefix) => {
  const p = stripQuery(prefix);
  const here = stripQuery(location.pathname);
  return here === p || here.startsWith(`${p}/`);
};

const ACTIVITY_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];

/**
 * One global inactivity session. It outlives the card element, so it keeps
 * counting after the user navigated to the protected view.
 */
const idleWatcher = {
  session: null,
  last: 0,
  timer: null,
  bump() {
    idleWatcher.last = Date.now();
  },
  start(session) {
    this.stop();
    this.session = session;
    this.last = Date.now();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, this.bump, { capture: true, passive: true }));
    this.timer = setInterval(() => this.check(), 1000);
  },
  stop(owner) {
    if (owner && this.session?.owner !== owner) return;
    ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, this.bump, { capture: true }));
    clearInterval(this.timer);
    this.timer = null;
    this.session = null;
  },
  remaining() {
    return this.session ? Math.max(0, this.session.seconds * 1000 - (Date.now() - this.last)) : 0;
  },
  check() {
    const s = this.session;
    if (!s || this.remaining() > 0) return;
    this.stop();
    s.onIdle();
  },
};

const STYLE = `
  :host { display: block; }
  [hidden] { display: none !important; }
  ha-card { padding: 16px; outline: none; overflow: hidden; }
  .header { display: flex; align-items: center; gap: 8px; }
  .title { flex: 1; font-size: var(--ha-card-header-font-size, 20px); font-weight: 500; color: var(--ha-card-header-color, var(--primary-text-color)); }
  .status { color: var(--secondary-text-color); font-variant-numeric: tabular-nums; font-size: 14px; }
  .lock-btn {
    border: none; border-radius: 999px; padding: 6px 14px; cursor: pointer; font: inherit; font-size: 14px;
    background: var(--secondary-background-color); color: var(--primary-text-color);
  }
  .lock-btn:hover { background: var(--divider-color); }
  .hint { color: var(--secondary-text-color); font-size: 14px; margin-top: 4px; }
  .lockpanel { max-width: var(--pac-max-width, 360px); margin: 12px auto 0; }
  .display {
    height: 52px; display: flex; align-items: center; justify-content: center;
    font-size: 28px; letter-spacing: 0.3em; border-radius: 12px; font-variant-numeric: tabular-nums;
    background: var(--secondary-background-color); color: var(--primary-text-color);
    overflow: hidden; white-space: nowrap;
  }
  .display.placeholder { font-size: 16px; letter-spacing: normal; color: var(--secondary-text-color); }
  .display.shake { animation: shake 0.35s; }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    20%, 60% { transform: translateX(-8px); }
    40%, 80% { transform: translateX(8px); }
  }
  .message { min-height: 20px; text-align: center; font-size: 14px; margin: 6px 0; }
  .message.error { color: var(--error-color, #db4437); }
  .message.success { color: var(--success-color, #43a047); }
  .keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .key {
    aspect-ratio: 1.6; border: none; border-radius: 14px; cursor: pointer;
    font: inherit; font-size: 22px; user-select: none; -webkit-tap-highlight-color: transparent;
    background: var(--secondary-background-color); color: var(--primary-text-color);
    transition: transform 0.08s ease, background 0.15s ease;
  }
  .key:hover { background: var(--divider-color); }
  .key:active { transform: scale(0.95); }
  .key.fn { color: var(--secondary-text-color); }
  .key.ok { background: var(--primary-color); color: var(--text-primary-color, #fff); font-size: 18px; font-weight: 500; }
  .key:disabled { opacity: 0.4; cursor: not-allowed; }
  .content { margin: 12px -16px -16px; --ha-card-box-shadow: none; --ha-card-border-width: 0; }
  @media (max-width: 380px) {
    .key { font-size: 20px; border-radius: 12px; }
    .keypad { gap: 8px; }
  }
`;

class PinActionCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("pin-action-card-editor");
  }

  static getStubConfig() {
    return {
      title: "PIN Lock",
      codes: ["1234"],
      unlock_action: { action: "navigate", navigation_path: "/lovelace/0" },
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._entry = "";
    this._unlocked = false;
    this._unlockUntil = 0;
    this._attempts = 0;
    this._lockoutUntil = 0;
    this._message = null;
    this._cardEl = null;
    this._timer = null;
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    const rawCodes = asList(config.codes ?? config.code);
    const codes = rawCodes
      .map((c) => (c !== null && typeof c === "object" ? { ...c, code: String(c.code ?? "") } : { code: String(c ?? "") }))
      .filter((c) => c.code.trim() !== "");
    if (!codes.length) throw new Error('Define at least one PIN in "codes"');

    this._config = { ...DEFAULTS, ...config };
    this._codes = codes;
    this._cardEl = null;
    this._lock(false);
    this._build();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._cardEl) this._cardEl.hass = hass;
  }

  connectedCallback() {
    this._syncTimer();
  }

  disconnectedCallback() {
    this._stopTimer();
  }

  getCardSize() {
    if (this._unlocked && this._cardEl?.getCardSize) return 1 + (this._cardEl.getCardSize() || 0);
    return this._unlocked ? 6 : 5;
  }

  // ---------- rendering ----------

  _build() {
    const c = this._config;
    this.shadowRoot.innerHTML = `
      <style>${STYLE}</style>
      <ha-card tabindex="0">
        <div class="header">
          <div class="title"></div>
          <div class="status"></div>
          <button class="lock-btn" type="button" hidden>Lock</button>
        </div>
        <div class="hint"></div>
        <div class="lockpanel">
          <div class="display" role="status" aria-live="polite"></div>
          <div class="message"></div>
          <div class="keypad">
            ${KEYS.map((k) => `<button type="button" class="key ${k.cls || ""}" data-key="${k.key}" aria-label="${k.label || k.text}">${k.text}</button>`).join("")}
          </div>
        </div>
        <div class="content"></div>
      </ha-card>`;

    const $ = (s) => this.shadowRoot.querySelector(s);
    this._els = {
      card: $("ha-card"),
      header: $(".header"),
      title: $(".title"),
      status: $(".status"),
      lockBtn: $(".lock-btn"),
      hint: $(".hint"),
      panel: $(".lockpanel"),
      display: $(".display"),
      message: $(".message"),
      keys: [...this.shadowRoot.querySelectorAll(".key")],
      content: $(".content"),
    };
    this._els.panel.style.setProperty("--pac-max-width", toCssWidth(c.max_width));

    $(".keypad").addEventListener("click", (ev) => {
      const btn = ev.target.closest(".key");
      if (btn) this._press(btn.dataset.key);
    });
    this._els.lockBtn.addEventListener("click", () => this._lock());
    this._els.card.addEventListener("keydown", (ev) => {
      if (this._unlocked || (ev.target !== this._els.card && !ev.target.classList?.contains("key"))) return;
      let key = null;
      if (/^[0-9]$/.test(ev.key)) key = ev.key;
      else if (ev.key === "Backspace") key = "back";
      else if (ev.key === "Enter") key = "ok";
      else if (ev.key === "Escape") key = "clear";
      if (key) {
        ev.preventDefault();
        this._press(key);
      }
    });

    this._update();
  }

  _update() {
    if (!this._els) return;
    const c = this._config;
    const e = this._els;
    const now = Date.now();
    const lockedOut = this._lockoutUntil > now;

    e.title.textContent = c.title || "";
    e.header.hidden = !c.title && !this._unlocked;
    e.hint.textContent = c.hint || "";
    e.hint.hidden = this._unlocked || !c.hint;
    e.panel.hidden = this._unlocked;
    e.lockBtn.hidden = !this._unlocked;
    const idleLeft = idleWatcher.session?.owner === this ? idleWatcher.remaining() : 0;
    const relockLeft = this._unlockUntil ? this._unlockUntil - now : 0;
    const left = [relockLeft, idleLeft].filter((v) => v > 0);
    e.status.textContent = this._unlocked && left.length ? `${Math.ceil(Math.min(...left) / 1000)}s` : "";

    if (lockedOut) {
      e.display.textContent = `Locked · ${Math.ceil((this._lockoutUntil - now) / 1000)}s`;
      e.display.classList.add("placeholder");
    } else if (!this._entry) {
      e.display.textContent = c.placeholder || " ";
      e.display.classList.add("placeholder");
    } else {
      e.display.textContent = c.mask_input === false ? this._entry : "•".repeat(this._entry.length);
      e.display.classList.remove("placeholder");
    }

    e.message.textContent = this._message?.text || "";
    e.message.className = `message ${this._message?.type || ""}`;
    e.keys.forEach((k) => (k.disabled = lockedOut));

    if (this._unlocked && this._cardEl) {
      if (this._cardEl.parentNode !== e.content) e.content.replaceChildren(this._cardEl);
    } else if (e.content.firstChild) {
      e.content.replaceChildren();
    }
  }

  _flash(text, type, ms = 2500) {
    clearTimeout(this._msgTimeout);
    this._message = text ? { text, type } : null;
    this._update();
    if (text) {
      this._msgTimeout = setTimeout(() => {
        this._message = null;
        this._update();
      }, ms);
    }
  }

  _shake() {
    const d = this._els?.display;
    if (!d) return;
    d.classList.remove("shake");
    void d.offsetWidth; // restart the animation
    d.classList.add("shake");
    setTimeout(() => d.classList.remove("shake"), 400);
  }

  // ---------- input ----------

  _press(key) {
    if (this._unlocked || this._lockoutUntil > Date.now()) return;
    if (key === "ok") return this._submit();
    if (key === "back") this._entry = this._entry.slice(0, -1);
    else if (key === "clear") this._entry = "";
    else if (/^[0-9]$/.test(key)) {
      const maxLen = Math.max(...this._codes.map((c) => c.code.length), 1);
      if (this._entry.length >= Math.max(maxLen, 12)) return;
      this._entry += key;
      if (this._config.auto_submit) {
        if (this._codes.some((c) => c.code === this._entry) || this._entry.length >= maxLen) return this._submit();
      }
    }
    if (this._message?.type === "error") this._message = null;
    this._update();
  }

  async _submit() {
    if (!this._entry) return;
    const c = this._config;
    const match = this._codes.find((code) => code.code === this._entry);
    this._entry = "";

    if (!match) {
      this._attempts += 1;
      this._shake();
      const max = Number(c.max_attempts) || 0;
      if (max > 0 && this._attempts >= max) {
        this._attempts = 0;
        this._lockoutUntil = Date.now() + (Number(c.lockout_seconds) || 30) * 1000;
        this._syncTimer();
        this._flash(`Too many attempts`, "error", 3000);
        await this._runActions(c.lockout_action);
      } else {
        this._flash(c.error_message, "error");
      }
      await this._runActions(c.wrong_action);
      return;
    }

    this._attempts = 0;
    const actions = match.action ?? match.unlock_action ?? c.unlock_action;

    this._startIdle(asList(actions));

    if (c.card) {
      this._unlocked = true;
      const relock = Number(c.relock_seconds);
      this._unlockUntil = relock > 0 ? Date.now() + relock * 1000 : 0;
      this._message = null;
      this._syncTimer();
      await this._ensureCard();
      this._update();
      fireEvent(this, "iron-resize");
    } else {
      const label = match.name ? `${c.success_message} · ${match.name}` : c.success_message;
      this._flash(label, "success", 2000);
    }

    await this._runActions(actions);
  }

  _startIdle(actions) {
    const c = this._config;
    const seconds = Number(c.idle_seconds) || 0;
    if (seconds <= 0) return;
    const unlockPath = location.pathname;
    const navTargets = actions.filter((a) => a?.action === "navigate" && a.navigation_path).map((a) => a.navigation_path);
    const paths = asList(c.idle_paths ?? navTargets);
    const idleActions =
      c.idle_action ?? (navTargets.length ? { action: "navigate", navigation_path: unlockPath } : { action: "none" });

    idleWatcher.start({
      owner: this,
      seconds,
      onIdle: () => {
        if (this._unlocked) this._lock();
        // Only kick the user out if they are still on a protected page.
        if (paths.length && !paths.some(onPath)) return;
        this._runActions(idleActions);
      },
    });
  }

  _lock(update = true) {
    idleWatcher.stop(this);
    this._unlocked = false;
    this._unlockUntil = 0;
    this._entry = "";
    this._syncTimer();
    if (update) this._update();
  }

  // ---------- timer ----------

  _syncTimer() {
    const needed = (this._unlocked && (this._unlockUntil || idleWatcher.session?.owner === this)) || this._lockoutUntil > Date.now();
    if (needed && !this._timer && this.isConnected) {
      this._timer = setInterval(() => this._tick(), 1000);
    } else if (!needed) {
      this._stopTimer();
    }
  }

  _stopTimer() {
    clearInterval(this._timer);
    this._timer = null;
  }

  _tick() {
    const now = Date.now();
    if (this._unlocked && this._unlockUntil && now >= this._unlockUntil) this._lock(false);
    if (this._lockoutUntil && now >= this._lockoutUntil) this._lockoutUntil = 0;
    this._syncTimer();
    this._update();
  }

  // ---------- inner card ----------

  async _ensureCard() {
    if (this._cardEl || !this._config.card) return;
    const cardConfig = this._config.card;
    let el;
    try {
      const helpers = await window.loadCardHelpers();
      el = helpers.createCardElement(cardConfig);
    } catch (err) {
      el = document.createElement("hui-error-card");
      el.setConfig?.({ type: "error", error: String(err), origConfig: cardConfig });
    }
    if (this._config.card !== cardConfig) return; // config changed while loading
    if (this._hass) el.hass = this._hass;
    el.addEventListener("ll-rebuild", (ev) => {
      ev.stopPropagation();
      this._cardEl = null;
      this._ensureCard().then(() => this._update());
    });
    this._cardEl = el;
  }

  // ---------- actions ----------

  async _runActions(actions) {
    for (const action of asList(actions)) {
      try {
        await this._runAction(action);
      } catch (err) {
        console.error("pin-action-card: action failed", action, err);
        this._flash(`Action failed: ${err?.message || err}`, "error", 5000);
        return;
      }
    }
  }

  _getHass() {
    return haRoot()?.hass || this._hass;
  }

  _eventNode() {
    return this.isConnected ? this : haRoot() || window;
  }

  async _runAction(a) {
    if (!a || typeof a !== "object") return;
    const type = a.action || (a.perform_action || a.service ? "perform-action" : "none");
    const entity = a.entity || a.entity_id || this._config.entity;

    switch (type) {
      case "none":
        return;
      case "navigate":
        return navigate(a.navigation_path, a.navigation_replace === true);
      case "url":
        if (a.url_path) window.open(a.url_path, a.new_tab === false ? "_self" : "_blank");
        return;
      case "perform-action":
      case "call-service": {
        const svc = a.perform_action || a.service;
        if (!svc || !svc.includes(".")) throw new Error(`Invalid action "${svc}"`);
        const [domain, service] = svc.split(".", 2);
        return this._getHass().callService(domain, service, a.data || a.service_data || {}, a.target);
      }
      case "toggle":
        if (!entity) throw new Error("toggle needs an entity");
        return this._getHass().callService("homeassistant", "toggle", { entity_id: entity });
      case "more-info":
        if (entity) fireEvent(this._eventNode(), "hass-more-info", { entityId: entity });
        return;
      case "fire-dom-event":
        fireEvent(this._eventNode(), "ll-custom", a);
        return;
      case "delay":
        return new Promise((r) => setTimeout(r, (Number(a.seconds) || 0) * 1000));
      case "relock":
        return this._lock();
      default:
        // Let Home Assistant's own action handler deal with anything else (e.g. "assist").
        fireEvent(this._eventNode(), "hass-action", { config: { tap_action: a, entity }, action: "tap" });
    }
  }
}

// ---------- GUI editor ----------

const LABELS = {
  title: "Title",
  hint: "Hint text",
  codes: "PIN codes",
  mask_input: "Mask digits",
  auto_submit: "Auto submit",
  unlock_action: "Action on unlock",
  wrong_action: "Action on wrong PIN",
  relock_seconds: "Auto relock (seconds, 0 = never)",
  max_width: "Max keypad width",
  max_attempts: "Max attempts (0 = unlimited)",
  lockout_seconds: "Lockout (seconds)",
  success_message: "Success message",
  idle_seconds: "Inactivity timeout (seconds, 0 = off)",
  idle_action: "Action after inactivity",
};

const HELPERS = {
  idle_seconds: "Any tap, key press or scroll restarts the timer",
  idle_action: "Default: navigate back to the PIN page",
  relock_seconds: "Only used when an inner card is configured",
  auto_submit: "Submit automatically when a full PIN has been typed",
};

class PinActionCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  _schema() {
    const c = this._config;
    const simpleCodes = asList(c.codes).every((x) => x === null || typeof x !== "object");
    const grid = (...schema) => ({ type: "grid", name: "", schema });
    return [
      grid({ name: "title", selector: { text: {} } }, { name: "hint", selector: { text: {} } }),
      ...(simpleCodes ? [{ name: "codes", selector: { text: { multiple: true, type: "password" } } }] : []),
      grid({ name: "mask_input", selector: { boolean: {} } }, { name: "auto_submit", selector: { boolean: {} } }),
      ...(Array.isArray(c.unlock_action) ? [] : [{ name: "unlock_action", selector: { ui_action: {} } }]),
      ...(Array.isArray(c.wrong_action) ? [] : [{ name: "wrong_action", selector: { ui_action: {} } }]),
      { name: "idle_seconds", selector: { number: { min: 0, mode: "box", unit_of_measurement: "s" } } },
      ...(Array.isArray(c.idle_action) ? [] : [{ name: "idle_action", selector: { ui_action: {} } }]),
      grid(
        { name: "max_attempts", selector: { number: { min: 0, mode: "box" } } },
        { name: "lockout_seconds", selector: { number: { min: 1, mode: "box", unit_of_measurement: "s" } } },
      ),
      grid(
        { name: "relock_seconds", selector: { number: { min: 0, mode: "box", unit_of_measurement: "s" } } },
        { name: "max_width", selector: { text: {} } },
      ),
      { name: "success_message", selector: { text: {} } },
    ];
  }

  _render() {
    if (!this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LABELS[s.name] ?? s.name;
      this._form.computeHelper = (s) => HELPERS[s.name];
      this._form.addEventListener("value-changed", (ev) => this._changed(ev));
      const note = document.createElement("p");
      note.style.cssText = "color: var(--secondary-text-color); font-size: 13px; margin: 16px 0 0;";
      note.innerHTML =
        "Inner card (<code>card:</code>), multiple actions and per-code actions are configured in the code editor. See the README.";
      this.replaceChildren(this._form, note);
    }
    const { type, ...rest } = this._config;
    this._form.hass = this._hass;
    this._form.data = { ...DEFAULTS, ...rest, codes: rest.codes ?? [] };
    this._form.schema = this._schema();
  }

  _changed(ev) {
    ev.stopPropagation();
    const config = { ...this._config, ...ev.detail.value };
    for (const [k, v] of Object.entries(config)) {
      if (v === undefined || v === "" || (k !== "type" && DEFAULTS[k] === v && this._config[k] === undefined)) delete config[k];
    }
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }
}

if (!customElements.get("pin-action-card")) customElements.define("pin-action-card", PinActionCard);
if (!customElements.get("pin-action-card-editor")) customElements.define("pin-action-card-editor", PinActionCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "pin-action-card")) {
  window.customCards.push({
    type: "pin-action-card",
    name: "PIN Action Card",
    description: "PIN keypad that runs an action (navigate, perform-action, toggle, ...) and/or reveals a card when unlocked.",
    preview: true,
    documentationURL: "https://github.com/sheaeinhorn/lovelace-pin-action-card",
  });
}

console.info(
  `%c PIN-ACTION-CARD %c v${CARD_VERSION} `,
  "color: white; background: #03a9f4; font-weight: 700;",
  "color: #03a9f4; background: white; font-weight: 700;",
);
