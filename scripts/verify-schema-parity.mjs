import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const snapshotPath = new URL("../drizzle/meta/0024_snapshot.json", import.meta.url);
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to verify schema parity.");
}

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const [databaseRows] = await connection.query("SELECT DATABASE() AS database_name");
const databaseName = databaseRows[0]?.database_name;

if (!databaseName) {
  throw new Error("Could not determine the current database name.");
}

const [tableRows] = await connection.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_type = 'BASE TABLE'",
  [databaseName],
);
const [columnRows] = await connection.query(
  "SELECT table_name, column_name, column_type, is_nullable, extra FROM information_schema.columns WHERE table_schema = ?",
  [databaseName],
);
const [indexRows] = await connection.query(
  "SELECT table_name, index_name, non_unique, seq_in_index, column_name FROM information_schema.statistics WHERE table_schema = ? ORDER BY table_name, index_name, seq_in_index",
  [databaseName],
);

await connection.end();

const actualTables = new Set(tableRows.map((row) => row.table_name));
const actualColumns = new Map();
for (const row of columnRows) {
  actualColumns.set(`${row.table_name}.${row.column_name}`, row);
}

const actualIndexes = new Map();
for (const row of indexRows) {
  const key = `${row.table_name}.${row.index_name}`;
  const index = actualIndexes.get(key) ?? {
    table: row.table_name,
    name: row.index_name,
    isUnique: Number(row.non_unique) === 0,
    columns: [],
  };
  index.columns[Number(row.seq_in_index) - 1] = row.column_name;
  actualIndexes.set(key, index);
}

const mismatches = [];
const normalizeType = (value) => String(value).toLowerCase().replace(/\s+/g, "");
const sameColumns = (left, right) => left.length === right.length && left.every((value, index) => value === right[index]);

for (const table of Object.values(snapshot.tables)) {
  if (!actualTables.has(table.name)) {
    mismatches.push({ kind: "missing_table", table: table.name });
    continue;
  }

  for (const column of Object.values(table.columns)) {
    const actual = actualColumns.get(`${table.name}.${column.name}`);
    if (!actual) {
      mismatches.push({ kind: "missing_column", table: table.name, column: column.name });
      continue;
    }

    if (normalizeType(actual.column_type) !== normalizeType(column.type)) {
      mismatches.push({ kind: "column_type", table: table.name, column: column.name, expected: column.type, actual: actual.column_type });
    }
    if ((actual.is_nullable === "NO") !== Boolean(column.notNull)) {
      mismatches.push({ kind: "column_nullability", table: table.name, column: column.name, expectedNotNull: Boolean(column.notNull), actualNullable: actual.is_nullable === "YES" });
    }
    if ((String(actual.extra).toLowerCase().includes("auto_increment")) !== Boolean(column.autoincrement)) {
      mismatches.push({ kind: "column_autoincrement", table: table.name, column: column.name, expected: Boolean(column.autoincrement), actual: actual.extra });
    }
  }

  for (const primaryKey of Object.values(table.compositePrimaryKeys ?? {})) {
    const actual = actualIndexes.get(`${table.name}.PRIMARY`);
    if (!actual || !sameColumns(actual.columns, primaryKey.columns)) {
      mismatches.push({ kind: "primary_key", table: table.name, expected: primaryKey.columns, actual: actual?.columns ?? [] });
    }
  }

  for (const index of Object.values(table.indexes ?? {})) {
    const actual = actualIndexes.get(`${table.name}.${index.name}`);
    if (!actual) {
      mismatches.push({ kind: "missing_index", table: table.name, index: index.name });
      continue;
    }
    if (actual.isUnique !== Boolean(index.isUnique) || !sameColumns(actual.columns, index.columns)) {
      mismatches.push({ kind: "index_definition", table: table.name, index: index.name, expected: { isUnique: Boolean(index.isUnique), columns: index.columns }, actual: { isUnique: actual.isUnique, columns: actual.columns } });
    }
  }
}

const expectedTableCount = Object.keys(snapshot.tables).length;
const result = {
  database: databaseName,
  expectedTableCount,
  actualTableCount: actualTables.size,
  mismatchCount: mismatches.length,
  mismatches,
};

console.log(JSON.stringify(result, null, 2));
process.exit(mismatches.length ? 1 : 0);
