// Countries whose inflation can be used, in the order shown before typing: US, Philippines, then by size of economy.
// Data comes from the Worker's /cpi (US: FRED monthly; others: World Bank annual).
export const COUNTRIES = [["US", "United States"], ["PH", "Philippines"], ["CN", "China"], ["DE", "Germany"], ["JP", "Japan"], ["IN", "India"], ["GB", "United Kingdom"], ["FR", "France"], ["IT", "Italy"], ["BR", "Brazil"], ["CA", "Canada"], ["RU", "Russia"], ["MX", "Mexico"], ["KR", "South Korea"], ["AU", "Australia"], ["ES", "Spain"], ["ID", "Indonesia"], ["TR", "Turkey"], ["NL", "Netherlands"], ["SA", "Saudi Arabia"], ["CH", "Switzerland"], ["PL", "Poland"], ["AR", "Argentina"], ["SE", "Sweden"], ["BE", "Belgium"], ["TH", "Thailand"], ["IE", "Ireland"], ["IL", "Israel"], ["AT", "Austria"], ["NO", "Norway"], ["AE", "United Arab Emirates"], ["SG", "Singapore"], ["VN", "Vietnam"], ["MY", "Malaysia"], ["ZA", "South Africa"], ["DK", "Denmark"], ["CO", "Colombia"], ["EG", "Egypt"], ["HK", "Hong Kong"], ["BD", "Bangladesh"], ["CL", "Chile"], ["FI", "Finland"], ["PK", "Pakistan"], ["PT", "Portugal"], ["NZ", "New Zealand"], ["CZ", "Czechia"], ["PE", "Peru"], ["RO", "Romania"], ["GR", "Greece"], ["NG", "Nigeria"], ["KE", "Kenya"]];

export const countryName = (code) => COUNTRIES.find(([c]) => c === code)?.[1] ?? code;

// Search box over COUNTRIES, styled like the ticker search (.combo / .suggest). Focus lists the first ones;
// typing filters by name or code; ↑↓ Enter Esc. onPick(code) is called with the choice.
export function countryPicker(input, onPick) {
  const wrap = document.createElement("div");
  wrap.className = "combo";
  input.before(wrap);
  const list = document.createElement("ul");
  list.className = "suggest";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  wrap.append(input, list);
  let hits = [], at = 0;
  const close = () => { list.hidden = true; };
  function render(all) {
    const q = all ? "" : input.value.trim().toLowerCase();
    hits = COUNTRIES.filter(([c, n]) => !q || n.toLowerCase().includes(q) || c.toLowerCase() === q).slice(0, 8);
    at = Math.min(at, Math.max(hits.length - 1, 0));
    list.replaceChildren(...hits.map(([c, n], k) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", k === at);
      li.dataset.k = k;
      const b = document.createElement("strong");
      b.textContent = n;
      const hint = document.createElement("span");
      hint.className = "hint";
      hint.textContent = c === "US" ? "monthly" : "yearly";
      li.append(b, hint);
      return li;
    }));
    list.hidden = !hits.length;
  }
  function choose(k) {
    close();
    input.blur();
    onPick(hits[k][0]);
  }
  input.addEventListener("focus", () => { input.select(); at = 0; render(true); });
  input.addEventListener("input", () => { at = 0; render(false); });
  input.addEventListener("blur", () => { close(); input.value = input.dataset.name; }); // abandon a half-typed search
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      at = (at + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
      render(!input.value.trim() || input.value === input.dataset.name);
    } else if (e.key === "Enter") { e.preventDefault(); choose(at); }
    else if (e.key === "Escape") input.blur();
  });
  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("[data-k]");
    if (li) { e.preventDefault(); choose(Number(li.dataset.k)); }
  });
}
