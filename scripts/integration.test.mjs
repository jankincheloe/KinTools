import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { createFilterBuilder, parseFilter } from "@jankincheloe/filter-builder";
import { createSavedViews } from "@jankincheloe/saved-views";
import { createDraftHandler } from "@jankincheloe/draft-handler";
import { createFileUpload } from "@jankincheloe/file-upload";
import { createHistory } from "@jankincheloe/history-handler";
import { createStorageState, createMemoryStorage } from "@jankincheloe/storage-state";
import { createTaskQueue } from "@jankincheloe/task-queue";
import { createCommandRegistry } from "@jankincheloe/command-registry";
import { exportCsv } from "@jankincheloe/data-export";
import { createQueryState, defineQueryField, stringCodec } from "@jankincheloe/query-state";
import { createSelectionState, selectOne, selectedIdsFor } from "@jankincheloe/selection-handler";
import { createFormHandler } from "@jankincheloe/form-handler";
import { useFilterBuilder } from "@jankincheloe/filter-builder/react";
import { useSavedViews } from "@jankincheloe/saved-views/react";
import { useDraftHandler } from "@jankincheloe/draft-handler/react";
import { useFileUpload } from "@jankincheloe/file-upload/react";
import { useHistory } from "@jankincheloe/history-handler/react";
import { useStorageState } from "@jankincheloe/storage-state/react";
import { useTaskQueue } from "@jankincheloe/task-queue/react";
import { useCommandRegistry } from "@jankincheloe/command-registry/react";

test("filter, URL state, saved views, selection and export compose without adapters", () => {
  const schema = { name: { type: "text", getValue: (row) => row.name } };
  const filter = createFilterBuilder(schema);
  filter.set({ field: "name", operator: "contains", value: "ad" });
  const query = createQueryState({ filter: defineQueryField(stringCodec, "") });
  query.set({ filter: filter.serialize() });
  const validate = (value) => { try { parseFilter(schema, value.filter); return true; } catch { return false; } };
  const adapter = createMemoryStorage();
  const storage = { read: () => adapter.read("views"), write: (source) => adapter.write("views", source) };
  const views = createSavedViews({ validate, storage });
  const saved = views.save({ name: "Ada", value: { filter: query.get().filter } });
  filter.reset();
  createSavedViews({ validate, storage }).apply(saved.id, (value) => filter.set(parseFilter(schema, value.filter)));
  const rows = filter.filter([{ id: "1", name: "Ada" }, { id: "2", name: "Grace" }]);
  const selection = selectOne(createSelectionState(), "1");
  const selected = new Set(selectedIdsFor(selection, rows.map((row) => row.id)));
  assert.equal(exportCsv(rows.filter((row) => selected.has(row.id)), [{ key: "name", header: "Name", value: (row) => row.name }]), "Name\r\nAda");
});
test("form changes can be autosaved and restored through validated storage", async () => {
  const validate = (value) => value && typeof value === "object" && typeof value.text === "string";
  const storage = createStorageState({ key: "draft", initialValue: { text: "" }, validate });
  const draft = createDraftHandler({ initialValue: { text: "" }, validate, persistence: { save: (value) => { if (!storage.set(value)) throw storage.getState().error; }, load: () => storage.getState().value } });
  const form = createFormHandler({ initialValues: { text: "" } });
  const stop = form.subscribe(() => draft.set(form.getState().values));
  form.setValue("text", "saved"); assert.equal(await draft.flush(), true); stop();
  const restored = createDraftHandler({ initialValue: { text: "" }, validate, persistence: { save: () => {}, load: () => storage.getState().value } });
  assert.equal(await restored.restore(), true); form.reset(restored.getState().value); assert.equal(form.getState().values.text, "saved");
  draft.dispose(); restored.dispose(); storage.dispose();
});
test("all eight React hooks render caller-owned stable snapshots during SSR", () => {
  const validate = (value) => typeof value === "string";
  const fixtures = [
    [useFilterBuilder, createFilterBuilder({ name: { type: "text", getValue: (value) => value } })],
    [useSavedViews, createSavedViews({ validate })],
    [useDraftHandler, createDraftHandler({ initialValue: "", validate, persistence: { save: () => {} } })],
    [useFileUpload, createFileUpload({ transport: { upload: () => null } })],
    [useHistory, createHistory("")],
    [useStorageState, createStorageState({ key: "x", initialValue: "", validate })],
    [useTaskQueue, createTaskQueue({ paused: true })],
    [useCommandRegistry, createCommandRegistry({}, () => ({}))],
  ];
  for (const [useController, controller] of fixtures) {
    const before = controller.getState();
    function Component() { const { state } = useController(controller); assert.strictEqual(state, before); return createElement("span", null, "ready"); }
    assert.equal(renderToString(createElement(Component)), "<span>ready</span>");
    assert.strictEqual(controller.getState(), before); controller.dispose?.();
  }
});
test("new package roots support ESM/CJS and do not load the optional React peer", async () => {
  const require = createRequire(import.meta.url);
  const packages = ["filter-builder", "saved-views", "draft-handler", "file-upload", "data-export", "command-registry", "history-handler", "storage-state", "task-queue"];
  for (const name of packages) {
    const packageName = `@jankincheloe/${name}`;
    assert.deepEqual(Object.keys(await import(packageName)).sort(), Object.keys(require(packageName)).sort());
  }
  const code = `const Module = require('node:module'); const load = Module._load; Module._load = function(id, ...args) { if (id === 'react') throw new Error('Core loaded React'); return load.call(this, id, ...args); }; for (const name of ${JSON.stringify(packages)}) require('@jankincheloe/' + name);`;
  const result = spawnSync(process.execPath, ["-e", code], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
