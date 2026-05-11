export const name = 'misc: openFile EPF + security confirm';
export const tags = ['openfile'];
export const timeout = 120000;

export default async function({ openFile, closeForm, getFormState, assert, step, log }) {
  const fs = await import('fs');
  const path = await import('path');
  const cp = await import('child_process');

  const dir = 'test-tmp/13-openfile';
  const srcDir = path.join(dir, 'src');
  const srcXml = path.join(srcDir, 'ТестОткрытия.xml');
  const buildDir = path.join(dir, 'build');
  const epfPath = path.join(buildDir, 'ТестОткрытия.epf');

  await step('setup: собрать тестовый EPF через epf-init + form-add + form-compile + epf-build (идемпотентно)', async () => {
    if (fs.existsSync(epfPath)) {
      log(`EPF уже собран: ${epfPath}, размер=${fs.statSync(epfPath).size}`);
      return;
    }
    const run = (script, args) => {
      const r = cp.spawnSync('powershell.exe', ['-NoProfile', '-File', script, ...args], { encoding: 'utf-8' });
      return { code: r.status, stdout: r.stdout, stderr: r.stderr };
    };

    // 1. epf-init — XML scaffold
    if (!fs.existsSync(srcXml)) {
      const init = run('.claude/skills/epf-init/scripts/init.ps1',
        ['-Name', 'ТестОткрытия', '-Synonym', 'Тест открытия из файла', '-SrcDir', srcDir]);
      assert.equal(init.code, 0, `epf-init exit=0 (stderr: ${init.stderr?.slice(0, 200)})`);
    }
    // 2. form-add — пустая форма
    const formDir = path.join(srcDir, 'ТестОткрытия/Forms/Форма');
    if (!fs.existsSync(path.join(formDir, 'Ext/Form.xml'))) {
      const fa = run('.claude/skills/form-add/scripts/form-add.ps1',
        ['-ObjectPath', srcXml, '-FormName', 'Форма']);
      assert.equal(fa.code, 0, 'form-add успешен');
    }
    // 3. form-compile — добавить текстовую декорацию
    const formJsonPath = path.join(dir, 'form.json');
    fs.writeFileSync(formJsonPath, JSON.stringify({
      title: 'Тест открытия',
      elements: [
        { label: 'Заголовок', title: 'Это тестовая обработка для проверки openFile' }
      ]
    }, null, 2), 'utf-8');
    const fc = run('.claude/skills/form-compile/scripts/form-compile.ps1',
      ['-JsonPath', formJsonPath, '-OutputPath', path.join(formDir, 'Ext/Form.xml')]);
    assert.equal(fc.code, 0, `form-compile успешен (stderr: ${fc.stderr?.slice(0, 200)})`);

    // 4. epf-build — собрать EPF
    const build = run('.claude/skills/epf-build/scripts/epf-build.ps1',
      ['-SourceFile', srcXml, '-OutputFile', epfPath,
        '-V8Path', 'C:\\Program Files\\1cv8\\8.3.24.1691\\bin']);
    log(`epf-build exit=${build.code}`);
    assert.equal(build.code, 0, `epf-build успешен (stderr: ${build.stderr?.slice(0, 200)})`);
    assert.ok(fs.existsSync(epfPath), 'EPF создан на диске');
    log(`EPF: ${epfPath} size=${fs.statSync(epfPath).size}`);
  });

  await step('openFile: открывает EPF с формой и текстовой декорацией (security confirm — авто)', async () => {
    const beforeForm = (await getFormState()).form;
    const r = await openFile(epfPath);
    log(`opened: form=${r.form} activeTab=${r.activeTab} texts=${JSON.stringify(r.texts)}`);
    assert.ok(r.form != null, 'state.form задан после openFile');
    assert.notEqual(r.form, beforeForm, 'открыта новая форма');
    assert.equal(r.activeTab, 'Тест открытия', 'заголовок формы из form-compile');
    // Security confirmation modal обрабатывается внутри openFile — наружу не пробивается
    assert.ok(!r.errors?.modal, 'нет оставшейся modal ошибки (security confirm обработан)');
    // Декорация видна в state.texts[]
    assert.ok(Array.isArray(r.texts) && r.texts.length >= 1, 'state.texts содержит декорации');
    const decor = r.texts.find(t => t.name === 'Заголовок');
    assert.ok(decor, 'декорация «Заголовок» присутствует в texts[]');
    assert.equal(decor.value, 'Это тестовая обработка для проверки openFile', 'текст декорации');
    // attempt=1 → security confirm не понадобился ИЛИ обработан с первой попытки
    assert.ok(r.opened?.attempt >= 1, 'opened.attempt задан');
  });

  await step('cleanup: закрываем форму обработки', async () => {
    await closeForm();
    const s = await getFormState();
    log(`after cleanup: form=${s.form} formCount=${s.formCount} activeTab=${s.activeTab}`);
    // Проверяем что наша EPF-форма точно закрылась. Между тестами в desktop
    // могут оставаться формы от других тестов — это не наш регресс.
    assert.notEqual(s.activeTab, 'Тест открытия', 'форма обработки ТестОткрытия закрыта');
  });
}
