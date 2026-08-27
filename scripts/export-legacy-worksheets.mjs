import { readFile } from 'node:fs/promises';

const rows = JSON.parse(await readFile(new URL('../data/worksheets.json', import.meta.url), 'utf8'));
const columns = ['ID','Title','Subject','Class','Level','Topic','Description','PDF URL','Thumbnail URL','Published Date','Status','Featured','Tags'];
const csv = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
console.log(columns.map(csv).join(','));
for (const row of rows) {
  const pdfUrl = row.driveId ? `https://drive.google.com/file/d/${row.driveId}/view` : '';
  console.log([row.id, row.title, row.subject, row.class, row.difficulty, row.category, row.description, pdfUrl, row.thumbnail, row.dateAdded, 'Published', row.featured ? 'Yes' : 'No', row.category].map(csv).join(','));
}
