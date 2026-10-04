/** Records a page as a constant-frame-rate MP4 through Chrome's screencast. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import type { CDPSession, Page } from 'playwright-core'
import { VIEW } from './drive'


export class Recorder {
  private frames: { t: number; file: string }[] = []
  private dir: string
  private cdp!: CDPSession
  private n = 0
  private stopped = false

  constructor(
    private page: Page,
    name: string,
  ) {
    this.dir = join(tmpdir(), `wordx-rec-${name}-${Date.now()}`)
    mkdirSync(this.dir, { recursive: true })
  }

  async start() {
    this.cdp = await this.page.context().newCDPSession(this.page)
    this.cdp.on('Page.screencastFrame', async (f) => {
      if (this.stopped) return
      const file = join(this.dir, `f${String(this.n++).padStart(6, '0')}.jpg`)
      writeFileSync(file, Buffer.from(f.data, 'base64'))
      this.frames.push({ t: f.metadata.timestamp ?? Date.now() / 1000, file })
      await this.cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
    })
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1, maxWidth: VIEW.width * 2, maxHeight: VIEW.height * 2 })
  }

  async stop() {
    this.stopped = true
    await this.cdp.send('Page.stopScreencast').catch(() => {})
  }

  /** Writes a constant-frame-rate MP4 spanning wall-clock [t0, t1] seconds. */
  encode(out: string, t0: number, t1: number) {
    const frames = this.frames.filter((f) => f.t <= t1)
    if (!frames.length) throw new Error('no frames captured')
    const lines: string[] = []
    const first = frames[0]
    if (first.t > t0) lines.push(`file '${first.file}'`, `duration ${(first.t - t0).toFixed(4)}`)
    frames.forEach((f, i) => {
      const next = frames[i + 1]?.t ?? t1
      lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - Math.max(f.t, t0)).toFixed(4)}`)
    })
    lines.push(`file '${frames[frames.length - 1].file}'`)
    const list = join(this.dir, 'list.txt')
    writeFileSync(list, lines.join('\n'))
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
  }

  cleanup() {
    rmSync(this.dir, { recursive: true, force: true })
  }
}

export function ffmpeg(args: string[]) {
  const r = spawnSync(ffmpegPath as unknown as string, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`)
}
