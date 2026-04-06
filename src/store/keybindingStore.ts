// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

/**
 * Keybinding Store — persists user keybinding overrides to localStorage.
 *
 * Only user-modified bindings are stored (diff-based).
 * On load the overrides are pushed into the registry via setOverrides().
 */

import { create } from 'zustand';
import {
  type ActionId,
  type KeyCombo,
  setOverrides,
  getDefaultDefinition,
  getDefaults,
  combosEqual,
  normalizeKeyCombo,
} from '@/lib/keybindingRegistry';

// ─── Serialisation ───────────────────────────────────────────────────

const STORAGE_KEY = 'oxideterm_keybindings';

type SerializedOverride = {
  mac?: KeyCombo;
  other?: KeyCombo;
};

type SerializedData = Record<string, SerializedOverride>;

function isValidCombo(value: unknown): value is KeyCombo {
  if (typeof value !== 'object' || value === null) return false;
  const combo = value as Record<string, unknown>;
  return (
    typeof combo.key === 'string' &&
    typeof combo.ctrl === 'boolean' &&
    typeof combo.shift === 'boolean' &&
    typeof combo.alt === 'boolean' &&
    typeof combo.meta === 'boolean'
  );
}

function isValidSerializedOverride(value: unknown): value is SerializedOverride {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const override = value as Record<string, unknown>;
  if (override.mac !== undefined && !isValidCombo(override.mac)) return false;
  if (override.other !== undefined && !isValidCombo(override.other)) return false;
  return override.mac !== undefined || override.other !== undefined;
}

function normalizeOverride(override: SerializedOverride): SerializedOverride {
  return {
    ...(override.mac ? { mac: normalizeKeyCombo(override.mac) } : {}),
    ...(override.other ? { other: normalizeKeyCombo(override.other) } : {}),
  };
}

function loadOverrides(): Map<ActionId, SerializedOverride> {
  const map = new Map<ActionId, SerializedOverride>();
  const validIds = new Set(getDefaults().map((d) => d.id));
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Invalid keybinding overrides payload');
    }
    for (const [id, override] of Object.entries(parsed)) {
      if (!validIds.has(id as ActionId)) {
        console.warn('[KeybindingStore] Unknown ActionId in localStorage, skipping:', id);
        continue;
      }
      if (!isValidSerializedOverride(override)) {
        console.warn('[KeybindingStore] Invalid override in localStorage, skipping:', id);
        continue;
      }
      map.set(id as ActionId, normalizeOverride(override));
    }
  } catch (e) {
    console.error('[KeybindingStore] Failed to load overrides, resetting to defaults:', e);
    localStorage.removeItem(STORAGE_KEY);
  }
  return map;
}

function persistOverrides(overrides: Map<ActionId, SerializedOverride>): void {
  try {
    const obj: SerializedData = {};
    for (const [id, override] of overrides) {
      obj[id] = override;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error('[KeybindingStore] Failed to persist overrides:', e);
  }
}

// ─── Store ───────────────────────────────────────────────────────────

type KeybindingStore = {
  overrides: Map<ActionId, SerializedOverride>;

  /**
   * Set (or clear) a user override for a specific action + platform side.
   * If the new combo matches the default, the override is removed (reset to default).
   */
  setBinding: (actionId: ActionId, side: 'mac' | 'other', combo: KeyCombo) => void;

  /**
   * Remove a user override for a specific action + platform side (reset to default).
   */
  resetBinding: (actionId: ActionId, side: 'mac' | 'other') => void;

  /**
   * Remove all user overrides (reset everything to defaults).
   */
  resetAll: () => void;
};

// Initialise: load from localStorage and push into registry immediately.
const initialOverrides = loadOverrides();
setOverrides(initialOverrides);

export const useKeybindingStore = create<KeybindingStore>((set) => ({
  overrides: initialOverrides,

  setBinding: (actionId, side, combo) => {
    set((state) => {
      const normalizedCombo = normalizeKeyCombo(combo);
      const def = getDefaultDefinition(actionId);
      const isDefault = def && combosEqual(def[side], normalizedCombo);

      const next = new Map(state.overrides);
      const existing = next.get(actionId) ?? {};

      if (isDefault) {
        // Remove override for this side — it matches the default
        const { [side]: _, ...rest } = existing;
        if (Object.keys(rest).length === 0) {
          next.delete(actionId);
        } else {
          next.set(actionId, rest);
        }
      } else {
        next.set(actionId, { ...existing, [side]: normalizedCombo });
      }

      setOverrides(next);
      persistOverrides(next);
      return { overrides: next };
    });
  },

  resetBinding: (actionId, side) => {
    set((state) => {
      const next = new Map(state.overrides);
      const existing = next.get(actionId);
      if (!existing) return state;

      const { [side]: _, ...rest } = existing;
      if (Object.keys(rest).length === 0) {
        next.delete(actionId);
      } else {
        next.set(actionId, rest);
      }

      setOverrides(next);
      persistOverrides(next);
      return { overrides: next };
    });
  },

  resetAll: () => {
    set(() => {
      const next = new Map<ActionId, SerializedOverride>();
      setOverrides(next);
      persistOverrides(next);
      return { overrides: next };
    });
  },
}));
