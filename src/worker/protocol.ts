import type { ChatSummary, IdentityMap } from '../core/types'
import type { ImportProgress, InputFile } from '../importers'
import type { Story } from '../analysis/story'

/** Messages UI → worker. */
export type WorkerRequest =
  | { type: 'import'; files: InputFile[]; timeZone: string }
  | { type: 'demo' }
  | { type: 'analyze'; identity: IdentityMap; include: string[] }

/**
 * Messages worker → UI. By construction none of these carry message text:
 * ChatSummary and Story are aggregate-only types.
 */
export type WorkerResponse =
  | { type: 'progress'; progress: ImportProgress }
  | {
      type: 'imported'
      chats: ChatSummary[]
      skipped: { path: string; reason: string }[]
      suggestion: IdentityMap
      demo: boolean
    }
  | { type: 'story'; story: Story }
  | { type: 'error'; message: string }
