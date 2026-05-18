# Regression suite authoring

Use this when the user asks to cover a 1C solution with automated regression tests, build out a test suite, or run an existing suite and analyse failures. For ad-hoc single-script automation, stay with the `run`/`exec` modes from SKILL.md instead.

The runner is the same `run.mjs`. The mode is `test`:

```bash
node $RUN test [url] <dir|file> [flags]
```

Tests live next to the project they cover (not inside the skill). Convention: `tests/` at the project root, with `_hooks.mjs` and `webtest.config.mjs` at the suite root. Tests are ES modules with `*.test.mjs` suffix.

## When to choose `test` over `exec`

| Goal | Mode |
|------|------|
| Explore a form, prototype a single step, debug one selector | `exec` (interactive session) |
| **Walk through a scenario live before committing it as a test** | `exec` first, then `test` |
| Reproduce a bug as a failing test before fixing it | `test` |
| Cover a feature so future changes are checked automatically | `test` |
| Run the project's regression on a new build | `test` |
| Generate a screencast walkthrough | `exec` with `startRecording` |

Don't write a `.test.mjs` for a one-shot user request. Don't drive a regression suite through chained `exec` calls.

## Before writing tests — recon

Two layers, in order. Don't skip either.

### 1. Static recon — metadata

Never invent identifiers. For every metadata object the user mentions (or that you decide to cover), run the matching info skill first:

| Object type | Skill |
|-------------|-------|
| Catalog/document/register attributes, tabular sections | `/meta-info` |
| Form layout — fields, buttons, tabs, tables | `/form-info` |
| DCS report — fields, parameters, filters | `/skd-info` |
| Spreadsheet template areas/parameters | `/mxl-info` |
| Role rights / restrictions | `/role-info` |
| Subsystem composition / command interface | `/subsystem-info` |

This gives the real Russian field labels, command names, column headers, table-section names. Without it, fuzzy matching will silently land on the wrong element, or fail with no useful diagnostic.

If the user names objects you cannot find: stop and ask. Do not guess.

### 2. Live recon — interactive walkthrough

For any non-trivial scenario, walk the path live in `exec` mode before writing it down. Metadata tells you what exists; the live walkthrough tells you what actually happens — which button posts the document, which dialog 1C raises, how the form looks after `clickElement('Создать')`, what fields are required, where `wait()` is genuinely needed.

```bash
# Start a session (background).
node $RUN start http://localhost:9191/myapp/ru_RU

# Step the scenario interactively. After each step, inspect.
cat <<'EOF' | node $RUN exec -
await navigateSection('Склад');
const cmds = await getCommands();
console.log(cmds);
EOF

cat <<'EOF' | node $RUN exec -
await openCommand('Приходная накладная');
await clickElement('Создать');
const s = await getFormState();
console.log(JSON.stringify(s.fields.map(f => ({ name: f.name, label: f.label, required: f.required })), null, 2));
console.log('buttons:', s.buttons.map(b => b.name));
console.log('tables:', s.tables.map(t => ({ name: t.name, label: t.label, columns: t.columns })));
EOF

# Try the actions you plan to encode. If a step fails, fix and re-try
# before transcribing it.
cat <<'EOF' | node $RUN exec -
await fillFields({ 'Контрагент': 'ООО Север' });
await fillTableRow({ 'Номенклатура': 'Товар 01', 'Количество': '5' },
                   { table: 'Товары', add: true });
await clickElement('Провести и закрыть');
console.log(JSON.stringify(await getFormState()));
EOF

# When done, stop the session (or leave it for the next test you write).
node $RUN stop
```

What to record from the walkthrough into the test:
- Exact button names (`'Провести и закрыть'`, not `'Сохранить'`).
- Field labels as 1C renders them (with possible non-breaking spaces — `fillFields` normalises, but be exact).
- Table section names from `getFormState().tables[].name`/`label` for multi-grid forms.
- Required `wait()` durations — only where a real async event happens (report generation, server-side calculation). Default actions await internally.
- The shape of `getFormState()` after each action — gives you the right `assert.equal(...)` paths.

After this, transcribe the working sequence into `*.test.mjs`, wrap each chunk in `step('...', async () => { ... })`, add assertions for the invariants you saw. Run the file once with `node $RUN test path/to/file.test.mjs` to confirm.

When live recon is overkill: trivial reads (`navigateSection` + `readTable` + assert non-empty), or scenarios you've already proven once in this session. When it's essential: anything with confirmation dialogs, posting/cancellation flows, reports with custom filters, multi-grid forms, or user-customised forms you've never seen.

## Suite layout

**Each application gets its own subfolder under `tests/`.** A single repo may host several independent suites side by side — they must not share `_hooks.mjs` or `webtest.config.mjs`, because each suite restores a different DB, publishes to a different URL, and ships its own test data.

```
tests/
  web-test/                    # engine self-tests (reserved if our repo layout)
  <app-name>/                  # application regression — one per solution
    _hooks.mjs
    webtest.config.mjs
    01-login/
    02-counterparties/
    ...
  <another-app>/               # second solution, fully isolated
    _hooks.mjs
    ...
```

`<app-name>` is the project/extension slug (`acc-payroll`, `erp-customisation`, etc.). Pick something stable and pass it on the CLI:

```bash
node $RUN test tests/<app-name>/
```

Inside the application subfolder, organize by **feature**, not by metadata kind. Numeric prefixes on both folder and file enforce run order (discovery is alphabetic by full path).

```
tests/<app-name>/
  _hooks.mjs                   # stand prep + cross-cutting hooks (optional)
  webtest.config.mjs           # url, contexts, defaults (optional)
  01-login/
    01-open-base.test.mjs
    02-section-navigation.test.mjs
  02-counterparties/
    01-create.test.mjs
    02-edit-phone.test.mjs
  03-goods-receipt/
    01-fill.test.mjs
    02-post.test.mjs
    03-unpost.test.mjs
  04-balance-report/
    01-generate.test.mjs
    02-warehouse-filter.test.mjs
  05-approval-process/
    01-end-to-end.test.mjs     # multi-user
```

Per-folder `_hooks.mjs` / `webtest.config.mjs` inside the application subfolder are NOT supported. Only the application-root copies are loaded.

## Test file anatomy

```js
export const name = 'Создание контрагента';       // required
export const tags = ['catalog', 'create'];        // optional, used for filtering + Allure
export const timeout = 60000;                     // optional, default 30000
// export const skip = 'pending fix #123';        // optional: true | string
// export const only = true;                      // debug-only — never commit
// export const context = 'manager';              // optional, single non-default context
// export const contexts = ['clerk', 'manager'];  // optional, multi-user test
// export const severity = 'critical';            // optional, overrides config severity

export async function setup(ctx) {
  // per-test prep — runs before default. Skip if not needed.
}

export async function teardown(ctx) {
  // per-test cleanup — runs after default, always (even on failure).
}

export default async function(ctx) {
  const { navigateSection, openCommand, clickElement, fillFields,
          readTable, closeForm, getFormState,
          assert, step, log } = ctx;

  await step('Открыть список контрагентов', async () => {
    await navigateSection('Продажи');
    await openCommand('Контрагенты');
  });

  await step('Создать нового контрагента', async () => {
    await clickElement('Создать');
    await fillFields({ 'Наименование': 'Тест ' + Date.now() });
    await clickElement('Записать и закрыть');
  });

  await step('Убедиться, что элемент появился в списке', async () => {
    const t = await readTable();
    assert.tableHasRow(t, r => r['Наименование']?.startsWith('Тест '));
  });
}
```

The runner injects every `browser.mjs` export into `ctx` plus `assert`, `step`, `log`, `testInfo`, `testResult` (afterEach only). For multi-context tests, each context name is its own scoped namespace (`ctx.clerk.clickElement(...)` etc.) — `step`/`assert` stay top-level.

**Step names — in Russian, descriptive.** Step labels surface in the console output, in JSON/JUnit, and as Allure step nodes. Russian-speaking QA reads them. Use a full action phrase (`'Создать нового контрагента'`, `'Проверить наличие документа в списке'`), not a tag (`'create'`, `'verify'`) and not a transliteration. Same applies to `export const name` and `displayName` in `webtest.config.mjs`.

## webtest.config.mjs

```js
export default {
  // Single-context: just url.
  url: 'http://localhost:9191/myapp/ru_RU',

  // OR multi-context: named contexts. Each test picks via `context`/`contexts` exports.
  // contexts: {
  //   clerk:   { url: 'http://localhost:9191/myapp-clerk/ru_RU',   displayName: 'Кладовщик' },
  //   manager: { url: 'http://localhost:9191/myapp-manager/ru_RU', displayName: 'Менеджер' },
  // },
  // defaultContext: 'clerk',

  timeout: 30000,
  retries: 0,
  screenshot: 'on-failure',
  record: false,

  // Severity → tags mapping for Allure. Each tag at most one bucket.
  severity: {
    critical: ['smoke', 'crud'],
    minor:    ['recording'],
  },
  defaultSeverity: 'normal',
};
```

CLI flags override config. Recommend latin context IDs + Russian `displayName` for video badges.

## _hooks.mjs

Two layers. Infra hooks run without a browser; testlevel hooks receive `ctx`.

```js
import { execSync } from 'child_process';

// Infra — runs once around the whole suite.
export async function prepare({ hookArgs, log, config }) {
  // Restore DB, publish to Apache, build EPF, etc.
  // hookArgs = everything after `--` on the CLI. Parse yourself.
  if (hookArgs.includes('--rebuild-stand')) { /* full rebuild */ }
  // Use idempotent hash-locks to skip work on warm starts.
}

export async function cleanup({ log, config }) {
  // Tear down or leave the stand running. Choose per project.
}

// Testlevel — runs with browser ctx.
export async function beforeAll(ctx) { /* once after first context opens */ }
export async function afterAll(ctx)  { /* once before final teardown */ }
export async function beforeEach(ctx) { /* ctx.testInfo is set */ }
export async function afterEach(ctx)  { /* ctx.testResult is set */ }

// Per-context — runs whenever a context is created/closed.
export async function afterOpenContext(ctx, name, spec)   { /* spec = config.contexts[name] */ }
export async function beforeCloseContext(ctx, name, spec) { }
```

Built-in state reset (`dismissPendingErrors` + close all forms) runs after `afterEach` automatically. Don't reimplement it.

**Where to put data setup:**
- DB restore, publication, EPF build → `prepare()`. Make it idempotent (hash-locks on inputs — config sources, EPF spec, DB dump) so warm starts skip everything but a liveness probe.
- Test-specific seed data (the document this test will edit, the counterparty it expects) → per-test `setup`.
- Shared session-wide warmup → `beforeAll`.

## Ready-to-paste patterns

### Catalog full cycle

```js
await step('Создать контрагента', async () => {
  await navigateSection('Продажи');
  await openCommand('Контрагенты');
  await clickElement('Создать');
  await fillFields({ 'Наименование': 'ТД Тест', 'ИНН': '7707083893' });
  await clickElement('Записать и закрыть');
});
await step('Проверить наличие в списке', async () => {
  const t = await readTable({ maxRows: 50 });
  assert.tableHasRow(t, { 'Наименование': 'ТД Тест' });
});
await step('Удалить контрагента и подтвердить удаление', async () => {
  await clickElement('ТД Тест');
  const page = await getPage();
  await page.keyboard.press('Delete');
  await clickElement('Да');
});
```

### Document create + post

```js
const marker = 'Тест-' + Date.now();
await openCommand('Приходная накладная');
await clickElement('Создать');
await fillFields({ 'Контрагент': 'ООО Север', 'Комментарий': marker });
await fillTableRow(
  { 'Номенклатура': 'Товар 01', 'Количество': '5', 'Цена': '100' },
  { table: 'Товары', add: true }
);
await clickElement('Провести и закрыть');
// Verify: re-open list, filter or scan, assert by `marker`.
```

Use a unique marker (`Date.now()` or random suffix) so re-runs don't collide. Identify your own row by it, not by position or natural keys that may already exist in the DB.

### DCS report

```js
await openCommand('Остатки товаров');
// Reset user settings — 1C persists them between sessions.
await clickElement('Ещё');
await clickElement('Установить стандартные настройки');

await selectValue('Номенклатура', 'Товар 02');   // auto-enables the filter checkbox
await clickElement('Сформировать');
await wait(3);
const r = await readSpreadsheet();
assert.deepEqual(r.headers, ['Номенклатура', 'Количество', 'Сумма']);
assert.ok(r.data.length >= 1);
assert.ok(r.totals?.['Сумма']);
```

### Multi-user process

```js
export const contexts = ['clerk', 'manager'];

export default async function({ clerk, manager, step, assert }) {
  await step('Кладовщик создаёт накладную', async () => {
    await clerk.navigateSection('Склад');
    await clerk.openCommand('Приходные накладные');
    await clerk.clickElement('Создать');
    await clerk.fillFields({ 'Контрагент': 'ООО Север' });
    await clerk.clickElement('Записать');
  });
  await step('Менеджер утверждает накладную', async () => {
    await manager.navigateSection('Согласование');
    await manager.openCommand('На утверждении');
    await manager.clickElement('ООО Север', { dblclick: true });
    await manager.clickElement('Утвердить');
  });
  await step('Кладовщик видит новый статус', async () => {
    const s = await clerk.getFormState();
    assert.equal(s.fields.find(f => f.name === 'Статус')?.value, 'Утверждён');
  });
  await step('Освободить сессию кладовщика', async () => {
    await manager.closeContext('clerk');   // free a 1C license for the next test
  });
}
```

License caveat: stock 1C allows ~2 web sessions concurrently. Close contexts you no longer need before the next multi-user test starts.

### Failing-test repro

```js
export const name = 'Bug #123: накладная без контрагента не должна проводиться';
export const tags = ['bug', 'validation'];

export default async function({ openCommand, clickElement, getFormState, assert, step }) {
  await openCommand('Приходные накладные');
  await clickElement('Создать');
  await clickElement('Провести');
  const s = await getFormState();
  assert.ok(s.errorModal || s.fields.find(f => f.name === 'Контрагент')?.required,
    'Должна быть ошибка валидации или поле помечено обязательным');
}
```

Write it red first, hand it to the user, fix the underlying issue, re-run green.

## Running

```bash
node $RUN test tests/<app-name>/                              # full app suite
node $RUN test tests/<app-name>/03-goods-receipt/             # one feature folder
node $RUN test tests/<app-name>/02-counterparties/01-create.test.mjs   # one file
node $RUN test tests/<app-name>/ --tags=smoke                 # by tag (intersection)
node $RUN test tests/<app-name>/ --grep='накладн'             # by name regex
node $RUN test tests/<app-name>/ --bail --retry=1             # stop on first fail, allow 1 retry
node $RUN test tests/<app-name>/ --report=allure-results --format=allure --report-dir=allure-results
node $RUN test tests/<app-name>/ -- --rebuild-stand           # everything after `--` goes to hooks
```

Default report is JSON when `--report=…` is given. Allure needs `--format=allure` + a directory. JUnit similarly with `--format=junit`.

### Allure static config — `_allure/` directory

The runner copies `<testDir>/_allure/` into the report directory before generating Allure output. Standard Allure convention applies — three files are typically used:

- **`categories.json`** — failure classification. Always emit this when setting up a suite, with 1C-specific patterns: license pool exhaustion (`Не обнаружено свободной лицензии`), 1C application errors (`ВызватьИсключение|Произошла ошибка|…`), navigation/element lookup misses, runner timeouts, assertion failures.
- **`environment.properties`** — `key=value` lines for the Environment widget. Useful when the suite runs across builds/branches (URL, 1C platform version, git branch, configuration version). Often emitted dynamically by `prepare()` rather than committed as a static file.
- **`executor.json`** — CI metadata (Jenkins URL, GitHub run ID, etc.). Only relevant when the suite runs on a CI server; for local runs, skip it.

Discovery skips the underscored directory, so it never collides with tests.

## Severity guidance

When the user doesn't dictate, default to:

| Test kind | Severity |
|-----------|----------|
| Login + section navigation, basic CRUD on covered entities | `critical` (also tag `smoke`) |
| Documents posting, report generation, end-to-end processes | `critical` |
| Field-level edge cases, formatting, optional flows | `normal` |
| Cosmetic / recording / non-functional | `minor` |
| Reserved for show-stopper protections | `blocker` (use sparingly) |

Don't promote everything to `critical` — it loses signal in the Allure dashboard.

## Anti-patterns

- **Sleeps as a substitute for assertions.** `wait(5)` after `openCommand` is fine; `wait(30)` because something flakes is a bug — find what state you can wait on with `getFormState` instead.
- **Retry as a substitute for understanding.** "Not found" twice means the data isn't there or the label is wrong. Don't loop.
- **Raw DOM via `getPage().$$(...)`.** Use `getFormState`, `readTable`, `readSpreadsheet`. Raw selectors break across 1C platform versions.
- **`clickElement('×')` or `clickElement('Закрыть')`** to dismiss a form. Use `closeForm({ save: true|false })` — handles confirmation correctly.
- **Position-based row identification** (`rows[0]`) when the DB has shared seed data. Filter by unique marker or label instead.
- **Skipping recon** because "I know what this catalog looks like." You don't — the project's customisation almost certainly differs from a stock config.
- **`tags: ['smoke']` on a 90-second test.** Smoke means fast.
- **Hand-writing reset code** in `afterEach`. The runner already closes forms and dismisses errors.
- **Cross-test state assumptions.** Each test must start from desktop and seed its own data. Order-of-execution coupling is a regression-suite trap.

## After a run — failure triage

1. Scan the JSON or Allure summary for `failed`.
2. For each failure, read `error.message` + `error.step` + screenshot (saved next to the report).
3. If `error.onecError.stack` is present — it's a 1C exception, look at the platform trace.
4. Classify:
   - **Test bug** — selector wrong, expectation wrong, race with no anchor → fix the test.
   - **Application bug** — actual misbehaviour reproduced → report to the user with the failing step name and the platform stack.
   - **Stand flake** — Apache timeout, login form not loading, license shortage → fix the hook idempotency or session-cleanup logic, not the test.
5. After fixes, re-run only the affected files (`node $RUN test tests/03-goods-receipt/`) before the full suite.

Report back to the user with the classification, not raw failure dumps.

## Reference

- Browser API: [SKILL.md](SKILL.md)
- Video and narration: [recording.md](recording.md)
