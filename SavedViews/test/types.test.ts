import { createSavedViews } from "../src/core.js";
import { useSavedViews } from "../src/react.js";
type View = { search: string };
const views = createSavedViews({ validate: (v): v is View => !!v && typeof v === "object" && "search" in v && typeof v.search === "string" });
useSavedViews(views).views.save({ name: "Open", value: { search: "open" } });
// @ts-expect-error views retain their payload type
views.save({ name: "Bad", value: { search: 1 } });
