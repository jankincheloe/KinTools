import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  createFormHandler,
  type FormHandler,
  type FormHandlerOptions,
  type FormState,
  type FormValues,
  type SetValueOptions,
} from "./core.js";

export type UseFormHandlerOptions<T extends FormValues> = FormHandlerOptions<T> &
  (
    | { values?: undefined; onValuesChange?: never }
    | { values: T; onValuesChange: (values: T) => void }
  );

export type UseFormHandlerResult<T extends FormValues> = {
  state: FormState<T>;
  form: FormHandler<T>;
};

/** React adapter with an optional controlled `values` prop. */
export function useFormHandler<T extends FormValues>(options: UseFormHandlerOptions<T>): UseFormHandlerResult<T> {
  const form = useMemo(
    () => createFormHandler(options),
    [options.initialValues, options.fields, options.validate, options.onSubmit, options.isEqual],
  );
  useEffect(() => {
    if (options.values !== undefined) form.setValues(options.values);
  }, [form, options.values]);
  const state = useSyncExternalStore(form.subscribe, form.getState, form.getState);
  const controlled = useMemo(() => {
    if (options.values === undefined) return form;
    const onValuesChange = options.onValuesChange;
    if (!onValuesChange) return form;
    const propose = (patch: Partial<T> | ((current: Readonly<T>) => Partial<T>)) => {
      const current = (options.values ?? form.getState().values) as T;
      const nextPatch = typeof patch === "function" ? patch(Object.freeze({ ...current })) : patch;
      onValuesChange({ ...current, ...nextPatch } as T);
    };
    const setValue: FormHandler<T>["setValue"] = (field, value, _setOptions?: SetValueOptions) =>
      propose({ [field]: value } as unknown as Partial<T>);
    const setValues: FormHandler<T>["setValues"] = (patch, _setOptions?: SetValueOptions) => propose(patch);
    return {
      ...form,
      setValue,
      setValues,
      reset: (nextValues?: T) => onValuesChange({ ...(nextValues ?? form.getState().initialValues) } as T),
    } as FormHandler<T>;
  }, [form, options.values, options.onValuesChange]);
  return { state, form: controlled };
}
