import { createFileUpload } from "../src/core.js";
import { useFileUpload } from "../src/react.js";
const upload = createFileUpload({ transport: { upload: (file: File) => ({ id: file.name }) } });
upload.add([] as File[]);
const state = useFileUpload(upload).state;
const id: string | undefined = state.files[0]?.result?.id;
void id;
// @ts-expect-error this transport accepts actual File objects
upload.add([{ name: "x", size: 1, type: "text/plain" }]);
