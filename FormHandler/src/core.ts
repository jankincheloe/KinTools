/** Object-shaped values may be interfaces, records, or inferred literals. */
export type FormValues = object;
export type FieldKey<T extends FormValues> = Extract<keyof T, string>;
export type FieldErrors<T extends FormValues> = Partial<Record<FieldKey<T>, string>>;

export type ValidationContext<T extends FormValues, K extends FieldKey<T>> = {
  readonly field: K;
  readonly values: Readonly<T>;
};

export type FieldValidator<T extends FormValues, K extends FieldKey<T>> = (
  value: T[K],
  context: ValidationContext<T, K>,
) => string | undefined | Promise<string | undefined>;

export type FormValidationResult<T extends FormValues> =
  | string
  | FieldErrors<T>
  | {
      fieldErrors?: FieldErrors<T>;
      formError?: string;
    }
  | undefined;

export type FormValidator<T extends FormValues> = (
  values: Readonly<T>,
) => FormValidationResult<T> | Promise<FormValidationResult<T>>;

export type FieldDefinition<T extends FormValues, K extends FieldKey<T>> = {
  validate?: FieldValidator<T, K>;
};

export type FieldDefinitions<T extends FormValues> = {
  [K in FieldKey<T>]?: FieldDefinition<T, K>;
};

export type FieldState = {
  readonly touched: boolean;
  readonly dirty: boolean;
  readonly validating: boolean;
  readonly error?: string;
};

export type FormState<T extends FormValues> = {
  readonly values: Readonly<T>;
  readonly initialValues: Readonly<T>;
  readonly fields: Readonly<Record<FieldKey<T>, FieldState>>;
  readonly errors: Readonly<FieldErrors<T>>;
  readonly formError?: string;
  readonly valid: boolean;
  readonly validating: boolean;
  readonly dirty: boolean;
  readonly submitting: boolean;
  readonly submitCount: number;
};

export type SubmitHandler<T extends FormValues> = (
  values: Readonly<T>,
) => void | undefined | Promise<void | undefined>;

export type FormHandlerOptions<T extends FormValues> = {
  initialValues: T;
  fields?: FieldDefinitions<T>;
  validate?: FormValidator<T>;
  onSubmit?: SubmitHandler<T>;
  isEqual?: (left: unknown, right: unknown) => boolean;
};

export type SetValueOptions = { validate?: boolean };

export type FormHandler<T extends FormValues> = {
  getState: () => FormState<T>;
  subscribe: (listener: () => void) => () => void;
  setValue: <K extends FieldKey<T>>(field: K, value: T[K], options?: SetValueOptions) => void;
  setValues: (values: Partial<T> | ((current: Readonly<T>) => Partial<T>), options?: SetValueOptions) => void;
  reset: (values?: T) => void;
  markTouched: <K extends FieldKey<T>>(field: K, touched?: boolean) => void;
  setFieldError: <K extends FieldKey<T>>(field: K, error?: string) => void;
  clearFieldError: <K extends FieldKey<T>>(field: K) => void;
  setServerErrors: (errors: FieldErrors<T>, formError?: string) => void;
  clearServerErrors: () => void;
  validate: () => Promise<boolean>;
  submit: (handler?: SubmitHandler<T>) => Promise<boolean>;
  getFirstErrorField: () => FieldKey<T> | undefined;
  firstErrorField: () => FieldKey<T> | undefined;
};

const isPromiseLike = <T>(value: unknown): value is PromiseLike<T> =>
  typeof value === "object" && value !== null && "then" in value && typeof (value as { then?: unknown }).then === "function";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ownKeys<T extends FormValues>(values: T): FieldKey<T>[] {
  return Object.keys(values) as FieldKey<T>[];
}

function normalizeValidation<T extends FormValues>(result: FormValidationResult<T>): { fields: FieldErrors<T>; form?: string } {
  if (typeof result === "string") return { fields: {}, form: result };
  if (!result || typeof result !== "object") return { fields: {} };
  if ("fieldErrors" in result || "formError" in result) {
    const structured = result as { fieldErrors?: FieldErrors<T>; formError?: string };
    return { fields: { ...(structured.fieldErrors ?? {}) } as FieldErrors<T>, form: structured.formError };
  }
  return { fields: { ...(result as FieldErrors<T>) } };
}

export function createFormHandler<T extends FormValues>(options: FormHandlerOptions<T>): FormHandler<T> {
  const keys = ownKeys(options.initialValues);
  let initialValues = { ...options.initialValues } as T;
  let values = { ...initialValues } as T;
  const touched: Record<string, boolean> = Object.fromEntries(keys.map((key) => [key, false]));
  const validating: Record<string, boolean> = Object.fromEntries(keys.map((key) => [key, false]));
  const validationErrors: FieldErrors<T> = {};
  const serverErrors: FieldErrors<T> = {};
  const fieldTokens: Record<string, number> = Object.fromEntries(keys.map((key) => [key, 0]));
  let formValidationError: string | undefined;
  let serverFormError: string | undefined;
  let formValidating = false;
  let submitting = false;
  let submitCount = 0;
  let validationRun = 0;
  const listeners = new Set<() => void>();
  const equal = options.isEqual ?? Object.is;

  const makeState = (): FormState<T> => {
    const errors: FieldErrors<T> = {};
    const fieldState: Record<string, FieldState> = {};
    let dirty = false;
    let hasValidationError = Boolean(formValidationError);
    let isValidating = formValidating;
    for (const key of keys) {
      const error = validationErrors[key] ?? serverErrors[key];
      if (error !== undefined) {
        errors[key] = error;
        hasValidationError = true;
      }
      const fieldDirty = !equal(values[key], initialValues[key]);
      dirty ||= fieldDirty;
      isValidating ||= validating[key];
      fieldState[key] = Object.freeze({
        touched: Boolean(touched[key]),
        dirty: fieldDirty,
        validating: Boolean(validating[key]),
        ...(error === undefined ? {} : { error }),
      });
    }
    if (serverFormError !== undefined) hasValidationError = true;
    const snapshot: FormState<T> = {
      values: Object.freeze({ ...values }),
      initialValues: Object.freeze({ ...initialValues }),
      fields: Object.freeze(fieldState) as Readonly<Record<FieldKey<T>, FieldState>>,
      errors: Object.freeze(errors),
      ...(formValidationError ?? serverFormError ? { formError: serverFormError ?? formValidationError } : {}),
      valid: !hasValidationError && !isValidating,
      validating: isValidating,
      dirty,
      submitting,
      submitCount,
    };
    return Object.freeze(snapshot);
  };

  let state = makeState();
  const publish = () => {
    state = makeState();
    listeners.forEach((listener) => listener());
  };
  const clearValidation = (key: FieldKey<T>) => {
    delete validationErrors[key];
  };
  const runFieldValidation = <K extends FieldKey<T>>(key: K): void => {
    const validator = options.fields?.[key]?.validate as FieldValidator<T, K> | undefined;
    const token = ++fieldTokens[key];
    clearValidation(key);
    if (!validator) {
      validating[key] = false;
      return;
    }
    let result: string | undefined | Promise<string | undefined>;
    try {
      result = validator(values[key], { field: key, values: Object.freeze({ ...values }) });
    } catch (error) {
      result = errorMessage(error);
    }
    if (!isPromiseLike<string | undefined>(result)) {
      validating[key] = false;
      if (result !== undefined) validationErrors[key] = result;
      return;
    }
    validating[key] = true;
    void Promise.resolve(result).then(
      (error) => {
        if (fieldTokens[key] !== token) return;
        validating[key] = false;
        clearValidation(key);
        if (error !== undefined) validationErrors[key] = error;
        publish();
      },
      (error: unknown) => {
        if (fieldTokens[key] !== token) return;
        validating[key] = false;
        validationErrors[key] = errorMessage(error);
        publish();
      },
    );
  };
  const invalidatePending = () => {
    validationRun++;
    formValidating = false;
    for (const key of keys) {
      // Field validators receive the complete values object, so changing any
      // field can make an in-flight validator for another field stale.
      fieldTokens[key]++;
      validating[key] = false;
    }
  };
  const validate = (): Promise<boolean> => {
    const run = ++validationRun;
    type FieldResult = { kind: "field"; key: FieldKey<T>; token: number; error?: string };
    type FormResult = { kind: "form"; result: FormValidationResult<T> };
    const pending: Array<Promise<FieldResult | FormResult>> = [];
    const fieldResults: Partial<Record<FieldKey<T>, string | undefined>> = {};
    formValidationError = undefined;
    for (const key of keys) {
      const validator = options.fields?.[key]?.validate as FieldValidator<T, typeof key> | undefined;
      const token = ++fieldTokens[key];
      clearValidation(key);
      if (!validator) continue;
      let result: string | undefined | Promise<string | undefined>;
      try {
        result = validator(values[key], { field: key, values: Object.freeze({ ...values }) });
      } catch (error) {
        result = errorMessage(error);
      }
      if (isPromiseLike<string | undefined>(result)) {
        validating[key] = true;
        pending.push(
          Promise.resolve(result).then(
            (error): FieldResult => ({ kind: "field", key, token, error }),
            (error): FieldResult => ({ kind: "field", key, token, error: errorMessage(error) }),
          ),
        );
      } else {
        validating[key] = false;
        fieldResults[key] = result;
      }
    }

    let formResult: FormValidationResult<T> | Promise<FormValidationResult<T>>;
    try {
      formResult = options.validate ? options.validate(Object.freeze({ ...values })) : undefined;
    } catch (error) {
      formResult = errorMessage(error);
    }
    const applyForm = (result: FormValidationResult<T>) => {
      const normalized = normalizeValidation(result);
      formValidationError = normalized.form;
      for (const key of keys) {
        const fieldError = fieldResults[key] ?? normalized.fields[key];
        if (fieldError !== undefined) validationErrors[key] = fieldError;
      }
    };

    if (isPromiseLike<FormValidationResult<T>>(formResult)) {
      formValidating = true;
      pending.push(
        Promise.resolve(formResult).then(
          (result): FormResult => ({ kind: "form", result }),
          (error): FormResult => ({ kind: "form", result: errorMessage(error) }),
        ),
      );
    } else {
      formValidating = false;
      applyForm(formResult);
    }
    publish();
    if (pending.length === 0) return Promise.resolve(state.valid);
    return Promise.all(pending).then((results) => {
      if (validationRun !== run) return state.valid;
      formValidating = false;
      let formResultValue: FormValidationResult<T> = undefined;
      for (const result of results) {
        if (result.kind === "form") formResultValue = result.result;
        else {
          const fieldResult = result;
          if (fieldTokens[fieldResult.key] === fieldResult.token) {
            validating[fieldResult.key] = false;
            clearValidation(fieldResult.key);
            if (fieldResult.error !== undefined) validationErrors[fieldResult.key] = fieldResult.error;
          }
        }
      }
      if (results.some((result) => result.kind === "form")) applyForm(formResultValue);
      publish();
      return state.valid;
    });
  };

  const setValues = (patch: Partial<T> | ((current: Readonly<T>) => Partial<T>), setOptions?: SetValueOptions) => {
    const nextPatch = typeof patch === "function" ? patch(Object.freeze({ ...values })) : patch;
    const nextValues = { ...values, ...nextPatch } as T;
    const changedKeys = keys.filter(
      (key) => Object.prototype.hasOwnProperty.call(nextPatch, key) && !equal(values[key], nextValues[key]),
    );
    if (changedKeys.length === 0) return;
    invalidatePending();
    values = nextValues;
    if (setOptions?.validate === false) {
      for (const key of changedKeys) clearValidation(key);
    } else {
      // Validators receive the full values context. Re-run every registered
      // validator so dependent fields (for example confirm-password) cannot
      // retain an error based on an earlier context.
      for (const key of keys) {
        if (options.fields?.[key]?.validate) runFieldValidation(key);
      }
    }
    publish();
  };

  const handler: FormHandler<T> = {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setValue: (field, value, setOptions) => setValues({ [field]: value } as unknown as Partial<T>, setOptions),
    setValues,
    reset: (nextValues) => {
      invalidatePending();
      validationRun++;
      initialValues = { ...(nextValues ?? initialValues) } as T;
      values = { ...initialValues } as T;
      for (const key of keys) {
        touched[key] = false;
        validating[key] = false;
        fieldTokens[key]++;
        clearValidation(key);
        delete serverErrors[key];
      }
      formValidationError = undefined;
      serverFormError = undefined;
      formValidating = false;
      submitCount = 0;
      submitting = false;
      publish();
    },
    markTouched: (field, value = true) => {
      touched[field] = value;
      publish();
    },
    setFieldError: (field, error) => {
      if (error === undefined) {
        delete serverErrors[field];
        delete validationErrors[field];
      } else serverErrors[field] = error;
      publish();
    },
    clearFieldError: (field) => {
      delete serverErrors[field];
      delete validationErrors[field];
      publish();
    },
    setServerErrors: (errors, formError) => {
      for (const key of keys) delete serverErrors[key];
      Object.assign(serverErrors, errors);
      serverFormError = formError;
      publish();
    },
    clearServerErrors: () => {
      for (const key of keys) delete serverErrors[key];
      serverFormError = undefined;
      publish();
    },
    validate,
    submit: async (submitHandler) => {
      submitCount++;
      for (const key of keys) touched[key] = true;
      publish();
      const valid = await validate();
      if (!valid) return false;
      submitting = true;
      publish();
      try {
        await (submitHandler ?? options.onSubmit)?.(Object.freeze({ ...values }));
        return true;
      } catch (error) {
        serverFormError = errorMessage(error);
        publish();
        return false;
      } finally {
        submitting = false;
        publish();
      }
    },
    getFirstErrorField: () => keys.find((key) => state.errors[key] !== undefined),
    firstErrorField: () => keys.find((key) => state.errors[key] !== undefined),
  };
  return handler;
}
