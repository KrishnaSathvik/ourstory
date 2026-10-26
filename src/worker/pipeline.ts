import type { ChatSummary, IdentityMap, ParsedChat } from '../core/types'
import { importFiles, summarize, type ImportProgress, type InputFile } from '../importers'
import { mergeChats, suggestIdentity } from '../merge/merge'
import { analyze } from '../analysis/analyze'
import type { Story } from '../analysis/story'
import { generateDemoFiles } from '../demo/generate'

/**
 * The processing pipeline, independent of the Worker transport so it can be
 * tested in Node. Holds raw chats in memory between import and analysis.
 */
export class Pipeline {
  private chats: ParsedChat[] = []
  private timeZone = 'UTC'
  private demo = false

  async import(files: InputFile[], timeZone: string, onProgress?: (p: ImportProgress) => void) {
    this.timeZone = timeZone
    this.demo = false
    const { chats, skipped } = await importFiles(files, { timeZone }, onProgress)
    this.chats = chats
    return this.describe(skipped)
  }

  async importDemo(onProgress?: (p: ImportProgress) => void) {
    const files = generateDemoFiles().map((f) => ({ blob: new Blob([f.content]), path: f.path }))
    const result = await this.import(files, 'UTC', onProgress)
    this.demo = true
    return { ...result, demo: true }
  }

  private describe(skipped: { path: string; reason: string }[]) {
    const summaries: ChatSummary[] = this.chats.map(summarize)
    return { chats: summaries, skipped, suggestion: suggestIdentity(summaries), demo: this.demo }
  }

  analyze(identity: IdentityMap, include: string[]): Story {
    const chosen = this.chats.filter((c) => include.includes(c.id))
    if (!chosen.length) throw new Error('Choose at least one conversation to include.')
    const { messages, report } = mergeChats(chosen, identity)
    const notes: string[] = []
    const platforms = new Set(chosen.map((c) => c.platform))
    if (platforms.size > 1) notes.push(`Combined ${chosen.length} conversations from ${platforms.size} apps into one timeline.`)
    if (report.duplicatesRemoved) notes.push(`${report.duplicatesRemoved} duplicate messages (the same message in two exports) were counted once.`)
    if (chosen.some((c) => c.warnings.some((w) => w.code === 'ambiguous-dates')))
      notes.push('Some WhatsApp dates were ambiguous (day-first vs month-first); we inferred the order from the message sequence.')
    if (!this.demo && chosen.some((c) => c.platform === 'whatsapp') && platforms.size > 1)
      notes.push(`WhatsApp times are shown as written on the exporting phone; other apps were converted to ${this.timeZone}.`)
    return analyze({ messages, identity, report, chats: chosen.length, timeZone: this.timeZone, demo: this.demo, notes })
  }

  /** Drop every raw message from memory. */
  forget() {
    this.chats = []
  }
}
