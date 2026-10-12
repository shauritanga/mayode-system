const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

// Load src/i18n.ts without React Native: the store and storage are stubbed out.
function loadI18n() {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "i18n.ts"), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: "commonjs", target: "es2020" } }).outputText;
  const stubs = {
    zustand: { create: () => () => (sel) => sel({ language: "en", setLanguage() {} }) },
    "zustand/middleware": { persist: (f) => f, createJSONStorage: () => null },
    "@react-native-async-storage/async-storage": {},
  };
  const m = { exports: {} };
  new Function("require", "module", "exports", js)((r) => stubs[r] ?? require(r), m, m.exports);
  return m.exports;
}

function dictionary(language) {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "i18n.ts"), "utf8");
  const start = source.indexOf(language === "en" ? "const en = {" : "const sw");
  const open = source.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (; end < source.length; end++) {
    if (source[end] === "{") depth++;
    else if (source[end] === "}" && --depth === 0) break;
  }
  const body = source.slice(open, end + 1);
  return new Function(`return (${body})`)();
}

test("Swahili has exactly the keys English has", () => {
  const en = dictionary("en");
  const sw = dictionary("sw");
  assert.deepEqual(Object.keys(en).filter((k) => !(k in sw)), [], "missing in Swahili");
  assert.deepEqual(Object.keys(sw).filter((k) => !(k in en)), [], "missing in English");
});

test("both languages use the same {placeholders} for every key", () => {
  const en = dictionary("en");
  const sw = dictionary("sw");
  const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  const bad = Object.keys(en).filter((k) => k in sw && vars(en[k]) !== vars(sw[k]));
  assert.deepEqual(bad, []);
});

test("translate falls back to English, then to the key", () => {
  const { translate } = loadI18n();
  assert.equal(translate("sw", "ok"), "Sawa");
  assert.equal(translate("en", "ok"), "OK");
  assert.equal(translate("sw", "no_such_key"), "no_such_key");
});
