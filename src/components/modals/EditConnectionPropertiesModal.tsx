// Copyright (C) 2026 AnalyseDeCircuit
// SPDX-License-Identifier: GPL-3.0-only

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../ui/tabs';
import { open } from '@tauri-apps/plugin-dialog';
import { api } from '../../lib/api';
import type { ConnectionInfo } from '../../types';

type EditConnectionPropertiesModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: ConnectionInfo | null;
  onSaved?: () => void;
};

export const EditConnectionPropertiesModal = ({
  open: isOpen,
  onOpenChange,
  connection,
  onSaved,
}: EditConnectionPropertiesModalProps) => {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('');
  const [authType, setAuthType] = useState<'password' | 'key' | 'agent' | 'certificate'>('password');
  const [keyPath, setKeyPath] = useState('');
  const [group, setGroup] = useState('');
  const [color, setColor] = useState('');
  const [groups, setGroups] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Capture connection snapshot at open time so handleSave never reads a stale prop
  const connectionRef = useRef<ConnectionInfo | null>(null);

  useEffect(() => {
    if (isOpen && connection) {
      connectionRef.current = connection;
      setError('');
      setName(connection.name || '');
      setHost(connection.host || '');
      setPort(String(connection.port || 22));
      setUsername(connection.username || '');
      setAuthType(connection.auth_type || 'password');
      setKeyPath(connection.key_path || '');
      setGroup(connection.group || 'Ungrouped');
      setColor(connection.color || '');
      api.getGroups().then(setGroups).catch(() => setGroups([]));
    }
  }, [isOpen, connection]);

  const handleBrowseKey = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: t('modals.new_connection.browse_key'),
        defaultPath: '~/.ssh',
      });
      if (selected && typeof selected === 'string') {
        setKeyPath(selected);
      }
    } catch (e) {
      console.error('Failed to open file dialog:', e);
    }
  };

  const handleAuthTypeChange = (value: string) => {
    if (value === 'password' || value === 'key' || value === 'agent' || value === 'certificate') {
      setAuthType(value);
    }
  };

  const handleSave = async () => {
    const conn = connectionRef.current;
    if (!conn || !host || !username) return;
    setSaving(true);
    setError('');
    try {
      await api.saveConnection({
        id: conn.id,
        name: name || `${username}@${host}`,
        group: group === 'Ungrouped' ? null : group,
        host,
        port: parseInt(port) || 22,
        username,
        auth_type: authType,
        key_path: (authType === 'key' || authType === 'certificate') ? keyPath : undefined,
        color: color || undefined,
        tags: conn.tags,
      });
      onOpenChange(false);
      onSaved?.();
    } catch (e) {
      console.error('Failed to save connection:', e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!connection) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto bg-theme-bg-elevated border-theme-border text-theme-text">
        <DialogHeader>
          <DialogTitle className="text-theme-text">
            {t('sessionManager.edit_properties.title')}
          </DialogTitle>
          <DialogDescription className="text-theme-text-muted">
            {t('sessionManager.edit_properties.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 p-4">
          {/* Name */}
          <div className="grid gap-2">
            <Label htmlFor="edit-name">{t('sessionManager.edit_properties.name')}</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${username}@${host}`}
            />
          </div>

          {/* Host + Port */}
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 grid gap-2">
              <Label htmlFor="edit-host">{t('sessionManager.edit_properties.host')} *</Label>
              <Input
                id="edit-host"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-port">{t('sessionManager.edit_properties.port')}</Label>
              <Input
                id="edit-port"
                value={port}
                onChange={(e) => setPort(e.target.value)}
              />
            </div>
          </div>

          {/* Username */}
          <div className="grid gap-2">
            <Label htmlFor="edit-username">{t('sessionManager.edit_properties.username')} *</Label>
            <Input
              id="edit-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {/* Auth Type */}
          <div className="grid gap-2">
            <Label>{t('sessionManager.edit_properties.auth_type')}</Label>
            <Tabs value={authType} onValueChange={handleAuthTypeChange} className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="password">{t('sessionManager.edit_properties.auth_password')}</TabsTrigger>
                <TabsTrigger value="key">{t('sessionManager.edit_properties.auth_key')}</TabsTrigger>
                <TabsTrigger value="agent">{t('sessionManager.edit_properties.auth_agent')}</TabsTrigger>
              </TabsList>

              <TabsContent value="password">
                <p className="text-xs text-theme-text-muted pt-2">
                  {t('sessionManager.edit_properties.password_hint')}
                </p>
              </TabsContent>

              <TabsContent value="key">
                <div className="space-y-2 pt-2">
                  <Label>{t('sessionManager.edit_properties.key_path')}</Label>
                  <div className="flex gap-2">
                    <Input
                      value={keyPath}
                      onChange={(e) => setKeyPath(e.target.value)}
                      placeholder="~/.ssh/id_rsa"
                    />
                    <Button variant="outline" size="sm" onClick={handleBrowseKey}>
                      {t('sessionManager.edit_properties.browse')}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="agent">
                <p className="text-xs text-theme-text-muted pt-2">
                  {t('sessionManager.edit_properties.agent_hint')}
                </p>
              </TabsContent>
            </Tabs>
          </div>

          {/* Group */}
          <div className="grid gap-2">
            <Label>{t('sessionManager.edit_properties.group')}</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Ungrouped">{t('sessionManager.edit_properties.ungrouped')}</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div className="grid gap-2">
            <Label>{t('sessionManager.edit_properties.color')}</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={color || '#22d3ee'}
                onChange={(e) => setColor(e.target.value)}
                className="w-9 h-9 rounded-md border border-theme-border cursor-pointer bg-transparent p-0.5"
              />
              {color && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setColor('')}
                  className="text-xs text-theme-text-muted"
                >
                  {t('sessionManager.edit_properties.clear_color')}
                </Button>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          {error && (
            <p className="text-xs text-theme-error mr-auto self-center">{error}</p>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('sessionManager.edit_properties.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !host || !username}>
            {saving ? t('sessionManager.edit_properties.saving') : t('sessionManager.edit_properties.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
