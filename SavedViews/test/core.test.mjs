import assert from "node:assert/strict";
import test from "node:test";
import { createSavedViews } from "../dist/core.js";

const validate = (v) => v && typeof v === "object" && typeof v.search === "string";
test("saves, updates, renames, applies and removes named views", () => {
  const views = createSavedViews({ validate, createId: () => "one", now: () => 42 });
  const input = { search: "open" }; const first = views.save({ name: " Open ", value: input }); input.search = "changed";
  assert.equal(first.value.search, "open"); assert.equal(first.name, "Open");
  views.rename(first.id, "Mine"); views.save({ id: first.id, name: "New", value: { search: "new" } });
  views.reload();
  assert.equal(views.getState().views.length, 1);
  let applied; views.apply(first.id, (value) => { applied = value; }); assert.deepEqual(applied, { search: "new" });
  assert.equal(views.remove(first.id), true); assert.equal(views.remove(first.id), false);
  assert.equal(first.name, "Open"); assert.throws(() => views.apply("missing", () => {}));
});
test("roundtrips persistence and migrates old view payloads", () => {
  let stored = JSON.stringify({ schemaVersion: 1, views: [{ id: "one", name: "Old", value: "hello", version: 1, updatedAt: 1 }] });
  const storage = { read: () => stored, write: (value) => { stored = value; } };
  const views = createSavedViews({ validate, storage, version: 2, migrate: (value) => ({ search: value }) });
  assert.equal(views.get("one").value.search, "hello");
  views.rename("one", "Migrated");
  assert.equal(createSavedViews({ validate, storage, version: 2 }).get("one").name, "Migrated");
});
test("rejects duplicate IDs and invalid imports atomically", () => {
  const views = createSavedViews({ validate, createId: () => "one" });
  views.save({ name: "First", value: { search: "a" } }); const before = views.getState();
  assert.throws(() => views.save({ name: "Second", value: { search: "b" } }), /Duplicate/);
  const envelope = JSON.parse(views.export()); envelope.views.push(envelope.views[0]);
  assert.throws(() => views.import(JSON.stringify(envelope)));
  assert.strictEqual(views.getState(), before);
  assert.throws(() => views.save({ name: "Bad", value: { search: 123 } }));
});
test("storage failures preserve views and expose an error", () => {
  let fail = false;
  const views = createSavedViews({ validate, storage: { read: () => null, write: () => { if (fail) throw new Error("quota"); } } });
  views.save({ id: "one", name: "First", value: { search: "a" } }); fail = true;
  assert.throws(() => views.remove("one"), /quota/);
  assert.equal(views.getState().views.length, 1); assert.match(views.getState().error.message, /quota/);
  assert.throws(() => { views.getState().views[0].value.search = "changed"; }, TypeError);
});
