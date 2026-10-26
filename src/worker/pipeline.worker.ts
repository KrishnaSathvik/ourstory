/// <reference lib="webworker" />
import { Pipeline } from './pipeline'
import type { WorkerRequest, WorkerResponse } from './protocol'

/**
 * Raw conversations live only here. The UI terminates this worker as soon
 * as the Story is built, which releases every message from memory.
 */
const pipeline = new Pipeline()
const post = (msg: WorkerResponse) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg)

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    if (req.type === 'import') {
      const res = await pipeline.import(req.files, req.timeZone, (progress) => post({ type: 'progress', progress }))
      post({ type: 'imported', ...res })
    } else if (req.type === 'demo') {
      const res = await pipeline.importDemo((progress) => post({ type: 'progress', progress }))
      post({ type: 'imported', ...res })
    } else if (req.type === 'analyze') {
      const story = pipeline.analyze(req.identity, req.include)
      pipeline.forget()
      post({ type: 'story', story })
    }
  } catch (err) {
    // Error messages are written by us; never include message text in them.
    post({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong while reading your files.' })
  }
}
