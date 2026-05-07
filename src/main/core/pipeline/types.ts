import type { PipelineStepName } from '@shared/types';

export interface ProgressEmitter {
  (e: { type: 'progress'; step: PipelineStepName; percent: number } |
      { type: 'log';      step: PipelineStepName; message: string }): void;
}

export interface JobContext {
  projectId: string;
  workDir: string;
  emit: ProgressEmitter;
  signal: AbortSignal;
  apiKey?: string;
}

export interface PipelineStep<TIn, TOut> {
  name: PipelineStepName;
  run(input: TIn, ctx: JobContext): Promise<TOut>;
}

/** Tiny helper: sleep for mock pipelines. */
export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new Error('aborted'));
    });
  });
