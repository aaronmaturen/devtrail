import { prisma } from '../lib/db/prisma';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

async function importCriteria() {
  const csvPath = path.join(process.cwd(), 'criteria.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  interface CriterionRecord {
    criterion_id: string;
    area_of_concentration: string;
    subarea: string;
    description: string;
    pr_detectable: string;
  }

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  }) as CriterionRecord[];

  console.log(`Found ${records.length} criteria to import...`);

  let imported = 0;
  for (const record of records) {
    const criterion = {
      id: parseInt(record.criterion_id, 10),
      areaOfConcentration: record.area_of_concentration,
      subarea: record.subarea,
      description: record.description,
      prDetectable: record.pr_detectable.toLowerCase() === 'true',
    };

    await prisma.criterion.upsert({
      where: { id: criterion.id },
      update: criterion,
      create: criterion,
    });

    imported++;
    console.log(`Imported: ${criterion.id} - ${criterion.areaOfConcentration} / ${criterion.subarea}`);
  }

  console.log(`\nSuccessfully imported ${imported} criteria!`);
  await prisma.$disconnect();
}

importCriteria().catch(console.error);
