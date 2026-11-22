// Form controls with live feedback. `liveField` checks an input as you type (a tick draws in, or the field
// shakes and says why); `dropdown` replaces a native <select> with a menu, keeping the select as the source
// of truth, so existing code that reads or sets `select.value` and listens for "change" keeps working.
const CHEV = '<svg class="chev" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
const CHECK = '<svg class="ck" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
const TICKER = /^[A-Z0-9][A-Z0-9.-]{0,11}$/;
const big = new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "long" });
const n = (x) => (Math.abs(x) >= 1e6 ? big.format(x) : x.toLocaleString("en-US")); // "1 billion", not "1,000,000,000"
let uid = 0;

const make = (tag, className, html = "") => Object.assign(document.createElement(tag), { className, innerHTML: html });

// Live feedback on a ticker or number input. Number rules come from its min / max / step attributes.
// compact: no hint line and no tick (for narrow inputs); a problem still turns the box red and shows as a tooltip.
// clear: an ✕ button that empties the box.
// format: turns a valid number into the line under the box ("$1,000,000"), so big amounts read at a glance.
export function liveField(input, { compact = false, clear = false, ticker = input.classList.contains("ticker"), format } = {}) {
  const isNumber = input.type === "number";
  const box = make("span", "fx" + (clear ? " has-clear" : "") + (compact ? "" : " has-tick"));
  input.before(box);
  box.append(input);
  let hint = "";
  let note;
  if (!compact) {
    box.insertAdjacentHTML("beforeend", CHECK.replace('class="ck"', 'class="tick"'));
    note = make("p", "help");
    note.id = `help-${++uid}`;
    note.setAttribute("aria-live", "polite");
    box.after(note);
    input.setAttribute("aria-describedby", note.id);
  }
  if (clear) {
    const x = make("button", "clear", "✕");
    x.type = "button";
    x.setAttribute("aria-label", "Clear");
    x.addEventListener("click", () => {
      input.value = "";
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true })); // refreshes this check and any ticker suggestions
    });
    box.append(x);
  }
  const min = input.min === "" ? null : +input.min;
  const max = input.max === "" ? null : +input.max;
  const range = min !== null && max !== null ? `from ${n(min)} to ${n(max)}` : min !== null ? `of ${n(min)} or more` : "";
  if (isNumber) hint = min !== null && max !== null ? `From ${n(min)} to ${n(max)}` : min !== null ? `At least ${n(min)}` : "";
  else if (ticker) hint = "Letters and digits, up to 12";

  // -> null (nothing to judge) or [ok, message]
  const judge = () => {
    const v = input.value.trim();
    if (isNumber) {
      if (!v && !input.validity.badInput) return null;
      if (input.validity.valid) return [true, format ? format(Number(v)) : hint];
      return [false, input.validity.stepMismatch ? "Use a whole number" : `Use a number ${range}`];
    }
    if (!ticker || !v) return null;
    return TICKER.test(v.toUpperCase()) ? [true, "Format looks right"] : [false, "Use letters, digits, . or - (up to 12)"];
  };
  let bad = false;
  function run() {
    const verdict = judge();
    const nowBad = verdict?.[0] === false;
    box.classList.toggle("has-value", input.value !== "");
    box.classList.toggle("ok", verdict?.[0] === true);
    box.classList.toggle("bad", nowBad);
    input.setAttribute("aria-invalid", nowBad);
    if (note) note.textContent = verdict ? verdict[1] : hint;
    else input.title = nowBad ? verdict[1] : "";
    if (nowBad && !bad) {
      box.classList.remove("shake");
      void box.offsetWidth; // restart the animation
      box.classList.add("shake");
    }
    bad = nowBad;
  }
  input.addEventListener("input", run);
  input.addEventListener("focusout", run);
  box.addEventListener("animationend", () => box.classList.remove("shake"));
  // A starting value that is fine is read back at once (no tick until the box is used). Returned, so a caller whose
  // format changed (another currency) can read the value back again.
  const readBack = () => { if (note && !bad) note.textContent = format && input.value !== "" && input.validity.valid ? format(Number(input.value)) : hint; };
  readBack();
  box.classList.toggle("has-value", input.value !== "");
  return readBack;
}

// Points at the box that stopped a form: scrolls it into view, focuses it, and shakes it red like a failed live
// check. A live field clears the red itself once its value is fine; any other box clears it on the next edit.
export function flagField(input) {
  const box = input.closest(".fx") ?? input;
  box.classList.remove("shake");
  void box.offsetWidth; // restart the animation
  box.classList.add("bad", "shake");
  box.addEventListener("animationend", () => box.classList.remove("shake"), { once: true });
  if (input.matches("input")) input.setAttribute("aria-invalid", "true"); // a button (Add holding) is only focused
  if (box === input) input.addEventListener("input", () => { input.classList.remove("bad"); input.removeAttribute("aria-invalid"); }, { once: true });
  input.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  input.focus({ preventScroll: true });
}

// Replaces <select> with a menu. help: { optionValue: "explanation" } shows the chosen option's explanation
// under the field; pass {} to reserve the line without text (keeps neighbouring fields level).
export function dropdown(select, { help } = {}) {
  const root = make("div", "dd");
  select.after(root);
  select.hidden = true;
  root.innerHTML = `<button type="button" class="dd-btn" aria-haspopup="listbox" aria-expanded="false"><span class="val"></span>${CHEV}</button><div class="dd-menu"><ul role="listbox"></ul></div>`;
  const btn = root.querySelector(".dd-btn");
  const val = root.querySelector(".val");
  const ul = root.querySelector("ul");
  const note = help ? make("p", "help") : null;
  if (note) root.after(note);
  const label = select.id && document.querySelector(`label[for="${select.id}"]`);
  if (label) {
    label.id ||= `${select.id}-label`;
    btn.setAttribute("aria-labelledby", label.id);
    label.addEventListener("click", () => btn.focus());
  }

  let items = [];
  let act = 0;
  let typed = "";
  let timer;
  const isOpen = () => root.dataset.open !== undefined;
  const paint = () => {
    items.forEach((li, i) => li.classList.toggle("act", i === act));
    items[act]?.scrollIntoView({ block: "nearest" });
  };
  function sync() {
    items = [...select.options].map((o, i) => {
      const li = make("li", "", `<span class="t"></span>${CHECK}`);
      li.setAttribute("role", "option");
      li.querySelector(".t").textContent = o.text; // textContent: portfolio names are user text
      li.addEventListener("mouseenter", () => { act = i; paint(); });
      li.addEventListener("click", () => pick(i));
      return li;
    });
    ul.replaceChildren(...items);
    items.forEach((li, i) => li.setAttribute("aria-selected", i === select.selectedIndex));
    val.textContent = select.selectedOptions[0]?.text ?? "";
    if (note) note.textContent = help[select.value] ?? "";
  }
  const open = () => {
    root.dataset.open = "";
    btn.setAttribute("aria-expanded", "true");
    act = Math.max(0, select.selectedIndex);
    paint();
  };
  const close = (refocus) => {
    delete root.dataset.open;
    btn.setAttribute("aria-expanded", "false");
    if (refocus) btn.focus();
  };
  function pick(i) {
    const changed = i !== select.selectedIndex;
    select.selectedIndex = i;
    sync();
    if (changed) {
      val.classList.remove("swap");
      void val.offsetWidth;
      val.classList.add("swap");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    close(true);
  }

  // Code that sets select.value directly (loading a portfolio) must update the button too.
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  Object.defineProperty(select, "value", { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
  new MutationObserver(sync).observe(select, { childList: true });

  btn.addEventListener("click", () => (isOpen() ? close() : open()));
  btn.addEventListener("keyup", (e) => { if (e.key === " ") e.preventDefault(); }); // Firefox clicks on Space keyup
  root.addEventListener("keydown", (e) => {
    const k = e.key;
    if (!isOpen()) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(k)) { e.preventDefault(); open(); }
      return;
    }
    if (k === "ArrowDown" || k === "ArrowUp") {
      e.preventDefault();
      act = (act + (k === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      paint();
    } else if (k === "Enter") { e.preventDefault(); pick(act); }
    else if (k === "Escape") { e.preventDefault(); close(true); }
    else if (k === "Tab") close();
    else if (k.length === 1 && k !== " ") { // type-ahead
      clearTimeout(timer);
      typed += k.toLowerCase();
      timer = setTimeout(() => (typed = ""), 600);
      const i = [...select.options].findIndex((o) => o.text.toLowerCase().startsWith(typed));
      if (i > -1) { act = i; paint(); }
    }
  });
  document.addEventListener("pointerdown", (e) => { if (!root.contains(e.target)) close(); });
  sync();
}
