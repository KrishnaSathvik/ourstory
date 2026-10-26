// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { Pipeline } from '../../src/worker/pipeline'
import type { Story } from '../../src/analysis/story'
import { Explore } from '../../src/ui/explore/Explore'

let story: Story

beforeAll(async () => {
  const p = new Pipeline()
  const r = await p.importDemo()
  story = p.analyze(r.suggestion, r.chats.map((c) => c.id))
}, 60_000)

const render = (hiddenWords: string[] = []) => renderToString(<Explore story={story} hiddenWords={hiddenWords} onHideWord={() => {}} />)

describe('Explore (Almanac)', () => {
  it('renders every section heading and the demo banner', () => {
    const html = render()
    for (const id of ['overview', 'timeline', 'rhythms', 'language', 'awards', 'about']) {
      expect(html).toContain(`id="${id}"`)
      expect(html).toContain(`id="${id}-title"`)
    }
    expect(html).toContain('Maya &amp; Theo are fictional')
    expect(html).toContain('Reveal words')
    expect(html).toContain('Conversation starters')
  })

  it('never contains demo message text', () => {
    const html = render().toLowerCase()
    expect(html).not.toContain('what do you want for dinner')
  })

  it('keeps vocabulary behind the reveal gate', () => {
    const html = render()
    const distinctive = story.words.distinctive[0][0]?.w
    expect(distinctive).toBeTruthy()
    expect(html).not.toContain(`>${distinctive}<`)
  })

  it('filters hidden words everywhere (emoji too)', () => {
    const e = story.emoji.top[0].w
    expect(render([])).toContain(e)
    const awardEmoji = new Set(story.awards.map((a) => a.emoji))
    expect(awardEmoji.has(e)).toBe(false)
    expect(render([e])).not.toContain(e)
  })
})
