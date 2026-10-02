import { afterEach, expect, test, vi } from 'vitest'

async function readVolume(saved: string | null) {
  vi.resetModules()
  vi.stubGlobal('document', { addEventListener: vi.fn(), getElementById: () => null })
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === 'gg-volume' ? saved : null })
  return (await import('../ui/audio')).getVolume()
}

afterEach(() => vi.unstubAllGlobals())

test('首次启动及坏设置保留默认音量，不能把空值当成主动关声', async () => {
  for (const value of [null, '', ' ', 'broken', '2', '-1']) expect(await readVolume(value)).toBe(.5)
})

test('保留用户明确保存的零音量和正常音量', async () => {
  expect(await readVolume('0')).toBe(0)
  expect(await readVolume('0.35')).toBe(.35)
})

test('存储不可用时音量设置仍能在当前会话使用', async () => {
  await readVolume(null)
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('unavailable') }, setItem: () => { throw Error('unavailable') } })
  vi.resetModules()
  const audio = await import('../ui/audio')
  expect(audio.getVolume()).toBe(.5)
  audio.setVolume(.3)
  expect(audio.getVolume()).toBe(.3)
})
