import type { IdentityMap } from '../core/types'
import type { ImportProgress, InputFile } from '../importers'
import type { Story } from '../analysis/story'
import type { WorkerRequest, WorkerResponse } from './protocol'

export type Imported = Extract<WorkerResponse, { type: 'imported' }>

/**
 * UI-side handle on the analysis worker. One worker per session; it is
 * terminated (and with it all raw messages) once a Story exists or the user
 * cancels.
 */
export class AnalysisSession {
  private worker: Worker | null = null
  private pending: { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void } | null = null
  onProgress: (p: ImportProgress) => void = () => {}

  private ensure(): Worker {
    if (this.worker) return this.worker
    const w = new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module', name: 'duet-analysis' })
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') return this.onProgress(msg.progress)
      const p = this.pending
      this.pending = null
      if (!p) return
      if (msg.type === 'error') p.reject(new Error(msg.message))
      else p.resolve(msg)
    }
    w.onerror = (e) => {
      const p = this.pending
      this.pending = null
      p?.reject(new Error(e.message || 'The analysis worker crashed. Your files may be too large for this device.'))
      this.dispose()
    }
    this.worker = w
    return w
  }

  private request(req: WorkerRequest): Promise<WorkerResponse> {
    const w = this.ensure()
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject }
      w.postMessage(req)
    })
  }

  /** Start the worker early so its script is loaded while still online. */
  warm() {
    this.ensure()
  }

  async import(files: InputFile[], timeZone: string): Promise<Imported> {
    return (await this.request({ type: 'import', files, timeZone })) as Imported
  }

  async demo(): Promise<Imported> {
    return (await this.request({ type: 'demo' })) as Imported
  }

  async analyze(identity: IdentityMap, include: string[]): Promise<Story> {
    const res = await this.request({ type: 'analyze', identity, include })
    this.dispose() // raw messages are gone with the worker
    return (res as Extract<WorkerResponse, { type: 'story' }>).story
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    if (this.pending) {
      this.pending.reject(new Error('Cancelled'))
      this.pending = null
    }
  }
}
