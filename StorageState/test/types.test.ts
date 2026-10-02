import { createStorageState } from "../src/core.js";
import { useStorageState } from "../src/react.js";
type Prefs = { count: number };
const storage = createStorageState({ key: "x", initialValue: { count: 0 }, validate: (v): v is Prefs => !!v && typeof v === "object" && "count" in v && typeof v.count === "number" });
useStorageState(storage).storage.set((value) => ({ count: value.count + 1 }));
// @ts-expect-error persisted values retain their type
storage.set({ count: "wrong" });
