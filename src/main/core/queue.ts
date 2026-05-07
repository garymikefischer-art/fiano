/**
 * Mini-Queue: ein Job nach dem anderen, kein externes Dep, kein ESM-Problem.
 * (Wir hatten kurz p-queue, aber das ist ESM-only und unser Main-Prozess
 *  läuft als CommonJS — eigene 20-Zeilen-Variante ist hier deutlich simpler.)
 */

interface QueuedJob {
  name: string;
  run: () => Promise<unknown>;
}

const jobs: QueuedJob[] = [];
let running = false;

export function enqueue(name: string, task: () => Promise<unknown>): void {
  console.log(`[queue] enqueue: ${name}`);
  jobs.push({ name, run: task });
  if (!running) void runNext();
}

async function runNext(): Promise<void> {
  const job = jobs.shift();
  if (!job) {
    running = false;
    return;
  }
  running = true;
  console.log(`[queue] start:    ${job.name}`);
  try {
    await job.run();
  } catch (err) {
    console.error(`[queue] error in ${job.name}:`, err);
  } finally {
    console.log(`[queue] done:     ${job.name}`);
  }
  void runNext();
}
