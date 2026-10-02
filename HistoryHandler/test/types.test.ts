import { createHistory } from "../src/core.js";
import { useHistory } from "../src/react.js";
const history = createHistory({ text: "" });
useHistory(history).history.set((current) => ({ text: current.text + "x" }));
// @ts-expect-error history retains its payload type
history.set({ text: 1 });
