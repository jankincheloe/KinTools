import { createDraftHandler } from "../src/core.js";
import { useDraftHandler } from "../src/react.js";
type Value = { text: string };
const draft = createDraftHandler({ initialValue: { text: "" }, validate: (v): v is Value => !!v && typeof v === "object" && "text" in v && typeof v.text === "string", persistence: { save: async (value) => { const text: string = value.text; void text; } } });
useDraftHandler(draft).draft.set({ text: "saved" });
// @ts-expect-error draft values retain their type
draft.set({ text: 1 });
