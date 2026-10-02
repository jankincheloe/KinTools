import { exportCsv, type ExportColumn } from "../src/core.js";
type Person = { name: string; age: number };
const columns: ExportColumn<Person>[] = [{ key: "name", header: "Name", value: (person) => person.name }];
exportCsv([{ name: "Ada", age: 36 }], columns);
// @ts-expect-error export cells are scalar values
const bad: ExportColumn<Person> = { key: "bad", header: "Bad", value: (person) => person };
void bad;
