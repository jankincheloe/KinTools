# FormHandler

`@jankincheloe/form-handler` is a small, product-neutral form state core. It
keeps values and field metadata immutable, accepts application-provided
validators, and has no runtime dependencies. React is an optional adapter
available from `@jankincheloe/form-handler/react`.

## Core usage

```ts
import { createFormHandler } from "@jankincheloe/form-handler";

type Values = { email: string; age: number };

const form = createFormHandler<Values>({
  initialValues: { email: "", age: 0 },
  fields: {
    email: { validate: (value) => value.includes("@") ? undefined : "Invalid email" },
    age: { validate: (value) => value >= 18 ? undefined : "Must be an adult" },
  },
  validate: (values) => values.email.endsWith(".invalid")
    ? { formError: "This domain cannot be used" }
    : undefined,
  onSubmit: async (values) => save(values),
});

form.setValue("email", "ada@example.test");
form.markTouched("email");
const submitted = await form.submit();
```

The handler exposes `getState`, `subscribe`, `setValue`, `setValues`, `reset`,
`markTouched`, `validate`, `submit`, `getFirstErrorField`, and field/server
error methods. `submit` marks all fields touched, increments `submitCount`,
validates (including async validators), and only calls the submit handler when
the form is valid. `reset(nextValues)` adopts `nextValues` as both the current
values and the new initial/dirty baseline. Async results are ignored when a
newer value or validation run supersedes them; rejected validators become form
errors instead of rejected handler promises.

When values change, every registered field validator runs against the new full
values context. This keeps dependent fields such as password confirmation
correct without a separate dependency declaration. Passing `{ validate: false
}` to `setValue` or `setValues` invalidates all in-flight validators and skips
new validation; validation errors for the fields that actually changed are
cleared.

Validation functions are intentionally replaceable. A field validator returns
an error string, `undefined`, or a promise of either. A form validator can
return a form error string, a field-error map, or
`{ fieldErrors, formError }`.

## React adapter

```tsx
import { useFormHandler } from "@jankincheloe/form-handler/react";

const { state, form } = useFormHandler({
  initialValues: { email: "" },
  values: externalValues,
  onValuesChange: (nextValues) => setExternalValues(nextValues),
});
```

The hook uses `useSyncExternalStore`. Omitting `values` gives an uncontrolled
form. Supplying `values` requires `onValuesChange`: `setValue`, `setValues`,
and `reset` call it with a proposed next value, but do not mutate the internal
store. The parent owns the canonical values and passes them back through the
`values` prop. Metadata actions (`markTouched`, error methods and validation)
remain available on `form` in both modes.

Autosave, draft restoration, multi-step wizards, navigation guards, and
schema-library adapters are deliberately future extensions. They are not
partially implemented in this package.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

[MIT](../LICENSE)
