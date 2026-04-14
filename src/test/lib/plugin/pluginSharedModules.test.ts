import { beforeEach, describe, expect, it } from 'vitest'

import {
  ensurePluginHostModules,
  resetPluginHostModulesForTests,
} from '@/lib/plugin/pluginSharedModules'

describe('pluginSharedModules', () => {
  beforeEach(() => {
    resetPluginHostModulesForTests()
  })

  it('does not register host modules until explicitly ensured', async () => {
    expect(window.__OXIDE__).toBeUndefined()

    const module = await import('@/lib/plugin/pluginSharedModules')

    expect(module.ensurePluginHostModules).toBeTypeOf('function')
    expect(window.__OXIDE__).toBeUndefined()
  })

  it('registers host modules lazily on first ensure', async () => {
    const hostModules = await ensurePluginHostModules('1.2.3')

    expect(window.__OXIDE__).toBe(hostModules)
    expect(hostModules.version).toBe('1.2.3')
    expect(hostModules.pluginApiVersion).toBe(3)
    expect(typeof hostModules.ReactDOM.createRoot).toBe('function')
    expect(typeof hostModules.zustand.create).toBe('function')
    expect(typeof hostModules.ui.Button).toBe('function')
  })

  it('deduplicates concurrent registration work', async () => {
    const [first, second] = await Promise.all([
      ensurePluginHostModules('1.2.3'),
      ensurePluginHostModules('1.2.3'),
    ])

    expect(first).toBe(second)
    expect(window.__OXIDE__).toBe(first)
  })
})