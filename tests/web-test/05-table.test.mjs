export const name = 'Табличная часть: add, edit, delete на Товары накладной';
export const tags = ['table', 'smoke'];
export const timeout = 90000;

export default async function({ navigateSection, openCommand, clickElement, fillFields, fillTableRow, deleteTableRow, readTable, closeForm, getFormState, assert, step, log }) {

  await step('add: добавить две строки в Товары через fillTableRow add:true', async () => {
    await navigateSection('Склад');
    await openCommand('Приходная накладная');
    await clickElement('Создать');
    await fillFields({ 'Контрагент': 'ООО Север' });

    await fillTableRow(
      { 'Номенклатура': 'Товар 01', 'Количество': '5', 'Цена': '100' },
      { table: 'Товары', add: true }
    );
    await fillTableRow(
      { 'Номенклатура': 'Товар 02', 'Количество': '3', 'Цена': '200' },
      { table: 'Товары', add: true }
    );

    const t = await readTable({ table: 'Товары' });
    log(`rows after add: ${t.rows?.length}`);
    assert.equal(t.rows?.length, 2, 'Должно быть 2 строки');
    assert.equal(t.rows[0]['Номенклатура'], 'Товар 01', 'Строка 0 = Товар 01');
    assert.equal(t.rows[1]['Номенклатура'], 'Товар 02', 'Строка 1 = Товар 02');
  });

  await step('edit: изменить количество в строке 0 через fillTableRow row:0', async () => {
    await fillTableRow(
      { 'Количество': '10' },
      { table: 'Товары', row: 0 }
    );
    const t = await readTable({ table: 'Товары' });
    log(`row 0 after edit: ${JSON.stringify(t.rows[0])}`);
    assert.equal(t.rows[0]['Количество'], '10,000', 'Количество строки 0 = 10');
  });

  await step('delete: удалить первую строку', async () => {
    await deleteTableRow(0, { table: 'Товары' });
    const t = await readTable({ table: 'Товары' });
    log(`rows after delete: ${t.rows?.length}, [0]=${t.rows[0]?.['Номенклатура']}`);
    assert.equal(t.rows?.length, 1, 'Должна остаться 1 строка');
    assert.equal(t.rows[0]['Номенклатура'], 'Товар 02', 'Осталась строка Товар 02');
    await closeForm({ save: false });
  });
}
