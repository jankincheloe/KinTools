import assert from "node:assert/strict";
import test from "node:test";
import { createFilterBuilder, filterItems, parseFilter, serializeFilter, validateFilter } from "../dist/core.js";

const schema = {
  name: { type: "text", getValue: (row) => row.name },
  age: { type: "number", getValue: (row) => row.age },
  active: { type: "boolean", getValue: (row) => row.active },
  status: { type: "enum", options: ["open", "closed"], getValue: (row) => row.status },
};
const people = [
  { name: "Ada", age: 36, active: true, status: "open" },
  { name: "Grace", age: 85, active: true, status: "closed" },
  { name: null, age: null, active: false, status: "open" },
];
test("combines typed range, enum, boolean and case-insensitive text filters", () => {
  const filter = { operator: "and", children: [
    { field: "age", operator: "between", value: [18, 40] },
    { field: "name", operator: "contains", value: "AD" },
    { operator: "or", children: [{ field: "status", operator: "in", value: ["open"] }, { field: "active", operator: "eq", value: false }] },
  ] };
  assert.deepEqual(filterItems(people, schema, filter), [people[0]]);
  assert.deepEqual(parseFilter(schema, serializeFilter(schema, filter)), filter);
});
test("empty groups and missing values have explicit semantics", () => {
  assert.equal(filterItems(people, schema, { operator: "and", children: [] }).length, 3);
  assert.equal(filterItems(people, schema, { operator: "or", children: [] }).length, 0);
  assert.deepEqual(filterItems(people, schema, { field: "name", operator: "empty" }), [people[2]]);
  assert.equal(filterItems(people, schema, { field: "age", operator: "ne", value: 36 }).length, 1);
});
test("rejects unknown fields, invalid operators, values and over-complex trees", () => {
  for (const node of [
    { field: "__proto__", operator: "eq", value: "bad" },
    { field: "age", operator: "contains", value: "3" },
    { field: "age", operator: "between", value: [40, 18] },
    { field: "age", operator: "eq", value: Infinity },
    { field: "active", operator: "eq", value: "true" },
    { field: "status", operator: "in", value: ["missing"] },
  ]) assert.throws(() => validateFilter(schema, node), TypeError);
  let deep = { operator: "and", children: [] };
  for (let i = 0; i < 34; i++) deep = { operator: "and", children: [deep] };
  assert.throws(() => validateFilter(schema, deep), /complex/);
});
test("controller owns snapshots and reset retains previous states", () => {
  const input = { operator: "and", children: [{ field: "age", operator: "gte", value: 30 }] };
  const builder = createFilterBuilder(schema, input);
  const before = builder.getState(); input.children[0].value = 100;
  assert.strictEqual(builder.getState(), before);
  assert.equal(builder.filter(people).length, 2);
  assert.throws(() => { before.filter.children.push({}); }, TypeError);
  builder.reset(); assert.equal(builder.filter(people).length, 3);
  assert.equal(before.filter.children.length, 1);
  assert.throws(() => { builder.getState().filter.children.push({}); }, TypeError);
});
