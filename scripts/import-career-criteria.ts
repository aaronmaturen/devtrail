/**
 * Import Engineering Career Guide criteria from CSV
 *
 * Usage: npx tsx scripts/import-career-criteria.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Map CSV columns to our types (0-indexed)
const LEVEL_COLUMNS = [
  { col: 3, type: 'junior_engineer', name: 'Software Engineer' },
  { col: 4, type: 'engineer', name: 'Software Engineer 2' },
  { col: 5, type: 'mid_engineer', name: 'Software Engineer 3' },
  { col: 6, type: 'senior_engineer', name: 'Senior Engineer' },
  { col: 7, type: 'staff_engineer', name: 'Staff Engineer' },
  { col: 8, type: 'senior_staff_engineer', name: 'Senior Staff Engineer' },
  { col: 9, type: 'principal_engineer', name: 'Principal Engineer' },
];

function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      if (char === '\r') i++;
    } else if (char !== '\r') {
      currentCell += char;
    }
  }

  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }

  return rows;
}

function isNA(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return lower === 'n/a' ||
         lower.includes('not applicable') ||
         lower === '' ||
         lower === 'n/a (not applicable at this level)';
}

function getReferencedLevel(text: string): string | null {
  const lower = text.toLowerCase().trim();

  // Check for "Same as X" patterns
  if (lower.startsWith('same as') || lower.startsWith('same ')) {
    if (lower.includes('software engineer 3') || lower.includes('se3')) return 'mid_engineer';
    if (lower.includes('software engineer 2') || lower.includes('se2')) return 'engineer';
    if (lower.includes('software engineer 1') || lower.includes('se1') || lower.includes('software engineer')) return 'junior_engineer';
    if (lower.includes('senior engineer')) return 'senior_engineer';
    if (lower.includes('staff engineer')) return 'staff_engineer';
    if (lower.includes('senior staff')) return 'senior_staff_engineer';
    if (lower.includes('principal')) return 'principal_engineer';
  }

  // Check for "see X" patterns
  if (lower.startsWith('see ')) {
    if (lower.includes('e3') || lower.includes('se3')) return 'mid_engineer';
    if (lower.includes('e2') || lower.includes('se2')) return 'engineer';
    if (lower.includes('e1') || lower.includes('se1')) return 'junior_engineer';
  }

  return null;
}

async function main() {
  const csvPath = path.join(process.env.HOME || '', 'Downloads', 'Engineering Career Guide.csv');

  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    process.exit(1);
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(content);

  console.log(`Parsed ${rows.length} rows from CSV`);

  // First pass: collect all raw criteria by competency and level
  type CriteriaMap = Record<string, Record<string, string>>; // competency -> level -> description
  const criteriaMap: CriteriaMap = {};

  let currentArea = '';
  const competencies: Array<{ area: string; subarea: string }> = [];

  // Start from row 4 (0-indexed), skipping headers
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 4) continue;

    // Update area if present
    if (row[0] && row[0].trim()) {
      currentArea = row[0].trim();
    }

    const theme = row[1]?.trim() || '';
    const competency = row[2]?.trim() || '';

    if (!competency) continue;

    const fullSubarea = theme ? `${theme} - ${competency}` : competency;
    const key = `${currentArea}|${fullSubarea}`;

    competencies.push({ area: currentArea, subarea: fullSubarea });
    criteriaMap[key] = {};

    // Collect raw descriptions for each level
    for (const level of LEVEL_COLUMNS) {
      const desc = row[level.col]?.trim() || '';
      criteriaMap[key][level.type] = desc;
    }
  }

  console.log(`Found ${competencies.length} competencies`);

  // Second pass: resolve references and build final criteria
  const criteriaToInsert: Array<{
    type: string;
    areaOfConcentration: string;
    subarea: string;
    description: string;
    prDetectable: boolean;
  }> = [];

  for (const comp of competencies) {
    const key = `${comp.area}|${comp.subarea}`;
    const levelDescs = criteriaMap[key];

    for (const level of LEVEL_COLUMNS) {
      let desc = levelDescs[level.type] || '';

      // Skip N/A entries
      if (isNA(desc)) {
        continue;
      }

      // Check if it references another level
      const refLevel = getReferencedLevel(desc);
      if (refLevel) {
        // Look up the referenced level's description
        const refDesc = levelDescs[refLevel];
        if (refDesc && !isNA(refDesc) && !getReferencedLevel(refDesc)) {
          desc = refDesc;
        } else {
          // Try to find a valid description by walking through levels
          let foundDesc = '';
          for (const searchLevel of LEVEL_COLUMNS) {
            const searchDesc = levelDescs[searchLevel.type];
            if (searchDesc && !isNA(searchDesc) && !getReferencedLevel(searchDesc)) {
              foundDesc = searchDesc;
              break;
            }
          }
          if (foundDesc) {
            desc = foundDesc;
          } else {
            continue; // Skip if we can't resolve
          }
        }
      }

      // Clean up the description
      desc = desc.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

      if (desc) {
        criteriaToInsert.push({
          type: level.type,
          areaOfConcentration: comp.area,
          subarea: comp.subarea,
          description: desc,
          prDetectable: true,
        });
      }
    }
  }

  console.log(`\nFound ${criteriaToInsert.length} criteria to import`);

  // Group by type for summary
  const byType: Record<string, number> = {};
  for (const c of criteriaToInsert) {
    byType[c.type] = (byType[c.type] || 0) + 1;
  }
  console.log('\nCriteria by level:');
  for (const level of LEVEL_COLUMNS) {
    console.log(`  ${level.name} (${level.type}): ${byType[level.type] || 0}`);
  }

  // Clear existing criteria
  console.log('\nClearing existing criteria...');
  await prisma.evidenceCriterion.deleteMany({});
  await prisma.criterion.deleteMany({});

  // Insert new criteria
  console.log('Inserting new criteria...');
  let nextId = 1;
  for (const criteria of criteriaToInsert) {
    await prisma.criterion.create({
      data: {
        id: nextId++,
        type: criteria.type,
        areaOfConcentration: criteria.areaOfConcentration,
        subarea: criteria.subarea,
        description: criteria.description,
        prDetectable: criteria.prDetectable,
      },
    });
  }

  console.log(`\nSuccessfully imported ${criteriaToInsert.length} criteria!`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
