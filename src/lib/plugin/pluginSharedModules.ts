// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import type { PluginUIKit } from './pluginUIKit'

type HostModules = NonNullable<Window['__OXIDE__']>

let registrationPromise: Promise<HostModules> | null = null

function createSafeLucideReact(lucideReact: typeof import('lucide-react')): typeof import('lucide-react') {
  return new Proxy(lucideReact, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver)
      if (value !== undefined) return value
      if (typeof prop === 'string' && /^[A-Z]/.test(prop)) {
        console.warn(`[OxideTerm] Unknown lucide icon "${prop}", using Puzzle fallback`)
        return lucideReact.Puzzle
      }
      return value
    },
  })
}

function buildHostModules(args: {
  hostVersion: string
  ReactModule: typeof import('react')
  ReactDOMModule: typeof import('react-dom/client')
  zustandModule: typeof import('zustand')
  lucideReactModule: typeof import('lucide-react')
  clsxModule: typeof import('clsx')
  reactI18nextModule: typeof import('react-i18next')
  pluginUIKit: PluginUIKit
  cn: typeof import('../utils').cn
}): HostModules {
  return {
    React: args.ReactModule,
    ReactDOM: { createRoot: args.ReactDOMModule.createRoot },
    zustand: { create: args.zustandModule.create },
    lucideIcons: args.lucideReactModule.icons,
    lucideReact: createSafeLucideReact(args.lucideReactModule),
    ui: args.pluginUIKit,
    clsx: args.clsxModule.clsx,
    cn: args.cn,
    useTranslation: args.reactI18nextModule.useTranslation,
    version: args.hostVersion,
    pluginApiVersion: 3,
  }
}

export async function ensurePluginHostModules(hostVersion: string): Promise<HostModules> {
  if (window.__OXIDE__) {
    return window.__OXIDE__
  }

  if (!registrationPromise) {
    registrationPromise = (async () => {
      const [
        ReactModule,
        ReactDOMModule,
        zustandModule,
        lucideReactModule,
        clsxModule,
        reactI18nextModule,
        pluginUIKitModule,
        utilsModule,
      ] = await Promise.all([
        import('react'),
        import('react-dom/client'),
        import('zustand'),
        import('lucide-react'),
        import('clsx'),
        import('react-i18next'),
        import('./pluginUIKit'),
        import('../utils'),
      ])

      const hostModules = buildHostModules({
        hostVersion,
        ReactModule,
        ReactDOMModule,
        zustandModule,
        lucideReactModule,
        clsxModule,
        reactI18nextModule,
        pluginUIKit: pluginUIKitModule.pluginUIKit,
        cn: utilsModule.cn,
      })

      window.__OXIDE__ = hostModules
      return hostModules
    })().catch((error) => {
      registrationPromise = null
      throw error
    })
  }

  return registrationPromise
}

export function resetPluginHostModulesForTests(): void {
  registrationPromise = null
  delete window.__OXIDE__
}