import { createTaskQueue } from "../src/core.js";
import { useTaskQueue } from "../src/react.js";
const queue = createTaskQueue<number>();
queue.add(async ({ signal }) => signal.aborted ? 0 : 1);
const result: number | undefined = useTaskQueue(queue).state.tasks[0]?.result;
void result;
// @ts-expect-error task results retain their type
queue.add(() => "wrong");
