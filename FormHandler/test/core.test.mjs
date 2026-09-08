import assert from "node:assert/strict";
import test from "node:test";

import {
  createFormHandler,
} from "../dist/core.js";

const initialValues = { email: "", age: 0, nickname: "" };

test("keeps state immutable and tracks dirty/touched fields", () => {
  const form = createFormHandler({ initialValues });
  const before = form.getState();
  form.setValue("email", "ada@example.test");
  form.markTouched("email");
  const after = form.getState();
  assert.equal(before.values.email, "");
  assert.equal(before.fields.email.dirty, false);
  assert.equal(after.fields.email.dirty, true);
  assert.equal(after.fields.email.touched, true);
  assert.notStrictEqual(before, after);
  assert.notStrictEqual(before.values, after.values);
});

test("runs field and form validation and finds the first error", async () => {
  const form = createFormHandler({
    initialValues,
    fields: {
      email: { validate: (value) => (value.includes("@") ? undefined : "Email is invalid") },
      age: { validate: (value) => (value >= 18 ? undefined : "Too young") },
    },
    validate: (values) => (values.nickname === "blocked" ? { formError: "Nickname is blocked" } : undefined),
  });
  assert.equal(await form.validate(), false);
  assert.equal(form.getState().errors.email, "Email is invalid");
  assert.equal(form.getState().errors.age, "Too young");
  assert.equal(form.getFirstErrorField(), "email");
  form.setValues({ email: "ada@example.test", age: 42, nickname: "blocked" });
  assert.equal(await form.validate(), false);
  assert.equal(form.getState().formError, "Nickname is blocked");
  form.setValue("nickname", "ok");
  assert.equal(await form.validate(), true);
  assert.equal(form.getState().valid, true);
});

test("ignores stale async validation results", async () => {
  const resolvers = [];
  const form = createFormHandler({
    initialValues: { username: "" },
    fields: {
      username: {
        validate: (value) => new Promise((resolve) => resolvers.push({ value, resolve })),
      },
    },
  });
  form.setValue("username", "old");
  form.setValue("username", "new");
  resolvers[0].resolve("old result");
  await Promise.resolve();
  assert.equal(form.getState().errors.username, undefined);
  resolvers[1].resolve("new result");
  await Promise.resolve();
  assert.equal(form.getState().errors.username, "new result");
});

test("invalidates async validators for every field when context changes", async () => {
  const resolvers = [];
  const form = createFormHandler({
    initialValues: { first: "", second: "old" },
    fields: {
      first: {
        validate: (_value, context) => new Promise((resolve) => resolvers.push({ context: context.values.second, resolve })),
      },
    },
  });
  form.setValue("first", "value");
  form.setValue("second", "new");
  resolvers[0].resolve("stale context: old");
  await Promise.resolve();
  assert.equal(form.getState().errors.first, undefined);
});

test("re-runs dependent validators after another field changes", async () => {
  const resolvers = [];
  const form = createFormHandler({
    initialValues: { password: "old", confirmation: "" },
    fields: {
      confirmation: {
        validate: (_value, context) =>
          new Promise((resolve) => resolvers.push({ password: context.values.password, resolve })),
      },
    },
  });
  form.setValue("confirmation", "old");
  form.setValue("password", "new");
  assert.deepEqual(resolvers.map(({ password }) => password), ["old", "new"]);
  resolvers[0].resolve("stale confirmation result");
  await Promise.resolve();
  assert.equal(form.getState().errors.confirmation, undefined);
  resolvers[1].resolve("confirmation no longer matches");
  await Promise.resolve();
  assert.equal(form.getState().errors.confirmation, "confirmation no longer matches");
});

test("tracks async form validation and ignores an older validation run", async () => {
  const resolvers = [];
  const form = createFormHandler({
    initialValues: { code: "" },
    validate: () => new Promise((resolve) => resolvers.push(resolve)),
  });
  const first = form.validate();
  const second = form.validate();
  assert.equal(form.getState().validating, true);
  resolvers[0]({ formError: "old" });
  await Promise.resolve();
  assert.equal(form.getState().formError, undefined);
  assert.equal(form.getState().validating, true);
  resolvers[1](undefined);
  assert.equal(await first, false);
  assert.equal(await second, true);
  assert.equal(form.getState().valid, true);
});

test("sets and clears server and field errors", () => {
  const form = createFormHandler({ initialValues });
  form.setServerErrors({ email: "Already registered" }, "Please check the form");
  assert.equal(form.getState().errors.email, "Already registered");
  assert.equal(form.getState().formError, "Please check the form");
  form.clearFieldError("email");
  form.clearServerErrors();
  assert.equal(form.getState().errors.email, undefined);
  assert.equal(form.getState().formError, undefined);
  form.setFieldError("age", "Invalid age");
  form.setFieldError("age");
  assert.equal(form.getState().errors.age, undefined);
});

test("reset(nextValues) establishes a new initial and dirty baseline", () => {
  const form = createFormHandler({ initialValues: { email: "old" } });
  form.setValue("email", "temporary");
  form.reset({ email: "server value" });
  assert.equal(form.getState().values.email, "server value");
  assert.equal(form.getState().initialValues.email, "server value");
  assert.equal(form.getState().dirty, false);
  form.setValue("email", "changed again");
  assert.equal(form.getState().dirty, true);
});

test("rejected async form validation becomes a form error", async () => {
  const form = createFormHandler({
    initialValues: { email: "ada@example.test" },
    validate: async () => {
      throw new Error("Validation service unavailable");
    },
  });
  assert.equal(await form.validate(), false);
  assert.equal(form.getState().formError, "Validation service unavailable");
  assert.equal(form.getState().validating, false);
});

test("submit touches fields, counts attempts, validates, and calls handler", async () => {
  const submitted = [];
  const form = createFormHandler({
    initialValues: { email: "" },
    fields: { email: { validate: (value) => (value ? undefined : "Required") } },
    onSubmit: (values) => submitted.push(values.email),
  });
  assert.equal(await form.submit(), false);
  assert.equal(form.getState().submitCount, 1);
  assert.equal(form.getState().fields.email.touched, true);
  form.setValue("email", "ada@example.test");
  assert.equal(await form.submit(), true);
  assert.deepEqual(submitted, ["ada@example.test"]);
  assert.equal(form.getState().submitting, false);
  form.reset();
  assert.equal(form.getState().submitCount, 0);
});
