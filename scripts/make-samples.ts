/**
 * Writes the fictional demo couple's exports to samples/ as real files
 * (WhatsApp zip, Instagram zip, Telegram JSON) for manual and e2e testing
 * of the actual import flow. All data is synthetic.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { zipSync, strToU8 } from 'fflate'
import { generateDemoFiles } from '../src/demo/generate'

const out = new URL('../samples/', import.meta.url)
mkdirSync(out, { recursive: true })
const [wa, ig, tg] = generateDemoFiles()
writeFileSync(new URL('WhatsApp Chat - Theo Lindqvist.zip', out), zipSync({ '_chat.txt': strToU8(wa.content) }))
writeFileSync(
  new URL('instagram-maya-2025.zip', out),
  zipSync({
    [ig.path.replace(/^instagram-maya\//, '')]: strToU8(ig.content),
    'your_instagram_activity/likes/liked_posts.json': strToU8('{"likes_media_likes":[]}'),
    'media/posts/202203/fake.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
  }),
)
writeFileSync(new URL('result.json', out), tg.content)
console.log('Wrote synthetic samples to samples/')
