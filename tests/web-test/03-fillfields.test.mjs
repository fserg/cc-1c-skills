export const name = 'fillFields: text, checkbox, date, dropdown, reference';
export const tags = ['fillfields', 'smoke'];
export const timeout = 60000;

const findField = (state, name) => state.fields?.find(f => f.name === name || f.label === name);

export default async function({ navigateSection, openCommand, clickElement, fillFields, closeForm, getFormState, assert, step, log }) {

  await step('text+checkbox+date+dropdown: fillFields на Номенклатура', async () => {
    await navigateSection('Склад');
    await openCommand('Номенклатура');
    await clickElement('Товары', { dblclick: true });   // войти в папку
    await clickElement('Товар 01', { dblclick: true });

    const result = await fillFields({
      'Артикул': 'TEST-001',
      'Активен': 'Нет',                       // Boolean → "Да/Нет" dropdown в 1С
      'ДатаПоступления': '15.05.2026',        // date
      'ВидНоменклатуры': 'Услуга',            // EnumRef dropdown
    });

    log('methods: ' + result.filled.map(f => `${f.field}=${f.method}`).join(', '));
    for (const f of result.filled) {
      assert.ok(f.ok, `fillField "${f.field}" должен вернуть ok=true`);
    }

    const state = await getFormState();
    assert.equal(findField(state, 'Артикул')?.value, 'TEST-001', 'Артикул text');
    assert.equal(findField(state, 'Активен')?.value, 'Нет', 'Активен dropdown=Нет');
    assert.equal(findField(state, 'ДатаПоступления')?.value, '15.05.2026', 'ДатаПоступления');
    assert.equal(findField(state, 'ВидНоменклатуры')?.value, 'Услуга', 'ВидНоменклатуры dropdown');

    await closeForm();
  });

  await step('reference-dropdown: Контрагент → CatalogRef.Контрагенты в новой накладной', async () => {
    await navigateSection('Склад');
    await openCommand('Приходная накладная');
    await clickElement('Создать');

    const fillRes = await fillFields({
      'Контрагент': 'ООО Север',
    });
    log('reference method: ' + fillRes.filled[0]?.method);
    assert.ok(fillRes.filled[0]?.ok, 'Контрагент fillField должен сработать');

    const state = await getFormState();
    const contractor = findField(state, 'Контрагент');
    log(`Контрагент value='${contractor?.value}'`);
    assert.includes(contractor?.value || '', 'Север', 'Контрагент должен показать выбранное значение');

    await closeForm();   // close without save
  });
}
