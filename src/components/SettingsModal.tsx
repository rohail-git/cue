import { useEffect, useState } from 'react';
import {
  Download,
  KeyRound,
  Palette,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import { testTmdbConnection } from '../services/mediaApi';
import { useCueStore } from '../store/useCueStore';

export function SettingsModal() {
  const {
    state,
    settingsOpen,
    setSettingsOpen,
    setImportModalOpen,
    updateProfile,
    updateSettings,
    exportLibraryJson,
    selectiveReset,
    clearAllData,
    showToast,
  } = useCueStore();

  const [name, setName] = useState(state.profile.name);
  const [handle, setHandle] = useState(state.profile.handle);
  const [bio, setBio] = useState(state.profile.bio);
  const [tmdbKey, setTmdbKey] = useState(state.settings.tmdbApiKey);
  const [tmdbStatus, setTmdbStatus] = useState<'idle' | 'testing' | 'ok' | 'err'>('idle');
  const [confirmScope, setConfirmScope] = useState<'watch' | 'read' | 'play' | 'all' | 'wipe' | null>(null);

  useEffect(() => {
    if (!settingsOpen) {
      setConfirmScope(null);
      return;
    }
    setName(state.profile.name);
    setHandle(state.profile.handle);
    setBio(state.profile.bio);
    setTmdbKey(state.settings.tmdbApiKey);
  }, [settingsOpen, state.profile.name, state.profile.handle, state.profile.bio, state.settings.tmdbApiKey]);

  if (!settingsOpen) return null;

  const bannerOptions = [
    ...state.showOrder.slice(0, 2).map((id) => ({
      label: state.shows[id]?.title || id,
      url: state.shows[id]?.backdropUrl || state.shows[id]?.posterUrl || '',
    })),
    ...state.gameOrder.slice(0, 2).map((id) => ({
      label: state.games[id]?.title || id,
      url: state.games[id]?.backdropUrl || state.games[id]?.coverUrl || '',
    })),
  ].filter((b) => b.url);

  const avatarOptions = [
    ...state.showOrder
      .flatMap((id) => state.shows[id]?.cast?.slice(0, 2).map((c) => c.avatarUrl) || []),
    ...state.showOrder.slice(0, 2).map((id) => state.shows[id]?.posterUrl),
  ]
    .filter((u): u is string => Boolean(u))
    .slice(0, 4);

  const handleSaveProfile = () => {
    const cleanHandle = handle.trim().startsWith('@') ? handle.trim() : `@${handle.trim()}`;
    updateProfile({
      name: name.trim() || 'You',
      handle: cleanHandle || '@you',
      bio: bio.trim(),
    });
  };

  const handleDownloadBackup = () => {
    const json = exportLibraryJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cue-journal-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported cue backup JSON');
  };

  const handleTestTmdb = async () => {
    if (!tmdbKey.trim()) {
      updateSettings({ tmdbApiKey: '' });
      setTmdbStatus('idle');
      return;
    }
    setTmdbStatus('testing');
    try {
      const ok = await testTmdbConnection(tmdbKey);
      setTmdbStatus(ok ? 'ok' : 'err');
      if (ok) {
        updateSettings({ tmdbApiKey: tmdbKey.trim() });
        showToast('TMDB live search connected');
      }
    } catch {
      setTmdbStatus('err');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/65 backdrop-blur-sm p-0 md:p-4 animate-fade-in"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="w-full md:max-w-xl max-h-[88dvh] flex flex-col bg-surface border border-white/10 rounded-t-[28px] md:rounded-[28px] shadow-2xl animate-sheet-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <h3 className="font-display font-bold text-lg text-ink">Settings & Library</h3>
          <button
            type="button"
            onClick={() => setSettingsOpen(false)}
            className="h-8 w-8 rounded-full bg-white/8 flex items-center justify-center text-ink-dim hover:text-ink"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-6">
          {/* Calm Section Palette Summary */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Palette className="w-4 h-4 text-ink-dim" />
              <h4 className="text-sm font-semibold text-ink">Soft Dark Appearance</h4>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl bg-background border border-white/8 p-3 flex items-center gap-2.5">
                <span className="h-4 w-4 rounded-full bg-watch shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-ink">Watch</p>
                  <p className="text-[11px] text-ink-dim">Soft Cyan</p>
                </div>
              </div>
              <div className="rounded-2xl bg-background border border-white/8 p-3 flex items-center gap-2.5">
                <span className="h-4 w-4 rounded-full bg-read shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-ink">Read</p>
                  <p className="text-[11px] text-ink-dim">Soft Amber</p>
                </div>
              </div>
              <div className="rounded-2xl bg-background border border-white/8 p-3 flex items-center gap-2.5">
                <span className="h-4 w-4 rounded-full bg-play shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-ink">Play</p>
                  <p className="text-[11px] text-ink-dim">Soft Purple</p>
                </div>
              </div>
            </div>
          </section>

          {/* Edit Profile */}
          <section className="space-y-3 pt-2 border-t border-white/8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-ink-dim" />
                <h4 className="text-sm font-semibold text-ink">Journal Profile</h4>
              </div>
              <button
                type="button"
                onClick={handleSaveProfile}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-brand text-brand-ink hover:opacity-90"
              >
                Save profile
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-ink-dim block mb-1">Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink focus:border-brand outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-ink-dim block mb-1">Label</label>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  className="w-full rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink focus:border-brand outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-ink-dim block mb-1">Bio</label>
              <input
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink focus:border-brand outline-none"
              />
            </div>

            {bannerOptions.length > 0 && (
              <div>
                <p className="text-xs text-ink-dim mb-1.5">Cover banner</p>
                <div className="grid grid-cols-4 gap-2">
                  {bannerOptions.map((b) => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={() => updateProfile({ bannerUrl: b.url })}
                      className={`relative h-12 rounded-xl overflow-hidden border ${
                        state.profile.bannerUrl === b.url
                          ? 'border-brand ring-1 ring-brand'
                          : 'border-white/10 opacity-75 hover:opacity-100'
                      }`}
                    >
                      <img src={b.url} alt={b.label} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {avatarOptions.length > 0 && (
              <div>
                <p className="text-xs text-ink-dim mb-1.5">Avatar</p>
                <div className="flex items-center gap-2.5">
                  {avatarOptions.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => updateProfile({ avatarUrl: url })}
                      className={`h-11 w-11 rounded-full overflow-hidden border-2 ${
                        state.profile.avatarUrl === url ? 'border-brand' : 'border-white/15 opacity-80'
                      }`}
                    >
                      <img src={url} alt="Avatar option" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Preferences */}
          <section className="space-y-2.5 pt-2 border-t border-white/8">
            <h4 className="text-sm font-semibold text-ink mb-2">Preferences</h4>
            <button
              type="button"
              onClick={() =>
                updateSettings({ showPosterProgress: !state.settings.showPosterProgress })
              }
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-background border border-white/8 text-sm"
            >
              <span>Show progress bars on artwork</span>
              <span
                className={`w-10 h-6 rounded-full p-0.5 transition-colors flex items-center ${
                  state.settings.showPosterProgress ? 'bg-brand justify-end' : 'bg-white/15 justify-start'
                }`}
              >
                <span className="w-5 h-5 rounded-full bg-white shadow" />
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  detailMode: state.settings.detailMode === 'advanced' ? 'simple' : 'advanced',
                })
              }
              className="w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-background border border-white/8 text-sm"
            >
              <span>Default detail card mode</span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white/8 text-brand capitalize">
                {state.settings.detailMode || 'simple'}
              </span>
            </button>
          </section>

          {/* Live Search */}
          <section className="space-y-2.5 pt-2 border-t border-white/8">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-ink-dim" />
                <h4 className="text-sm font-semibold text-ink">Live Catalog APIs</h4>
              </div>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-watch/15 text-watch">
                English-First Active
              </span>
            </div>
            <p className="text-xs text-ink-dim">
              TVMaze, iTunes/Wikipedia, Open Library, AniList, and Steam/CheapShark work out of the
              box. Optionally add a TMDB v3 API key for Watch multi-search.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                placeholder="TMDB v3 API key (optional)"
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                className="flex-1 rounded-xl bg-background border border-white/10 px-3 py-2 text-sm text-ink focus:border-brand outline-none"
              />
              <button
                type="button"
                onClick={handleTestTmdb}
                className="px-3.5 py-2 rounded-xl bg-surface-raised border border-white/10 text-xs font-semibold text-ink hover:bg-white/10"
              >
                {tmdbStatus === 'testing' ? 'Testing…' : 'Save & Test'}
              </button>
            </div>
            {tmdbStatus === 'ok' && (
              <p className="text-xs text-watch">TMDB API key verified and enabled.</p>
            )}
            {tmdbStatus === 'err' && (
              <p className="text-xs text-red-300">
                Could not verify key; zero-config search remains active.
              </p>
            )}
          </section>

          {/* Data Import / Export */}
          <section className="space-y-2.5 pt-2 border-t border-white/8">
            <h4 className="text-sm font-semibold text-ink">Local Backup & Smart Import</h4>
            <p className="text-xs text-ink-dim">
              Export a JSON backup anytime or safely import IMDb CSV, Letterboxd CSV, Goodreads CSV,
              Trakt / TV Time, or cue JSON with preview and Undo.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={handleDownloadBackup}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-background border border-white/10 text-sm font-medium text-ink hover:bg-surface-raised"
              >
                <Download className="w-4 h-4 text-ink-dim" />
                <span>Export JSON</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(false);
                  setImportModalOpen(true);
                }}
                className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-background border border-white/10 text-sm font-medium text-ink hover:bg-surface-raised"
              >
                <Upload className="w-4 h-4 text-watch" />
                <span>Smart Import</span>
              </button>
            </div>
          </section>

          {/* Reset Progress Data vs Remove All Data */}
          <section className="space-y-3 pt-2 border-t border-white/8 pb-2">
            <div>
              <div className="flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-ink-dim" />
                <h4 className="text-sm font-semibold text-ink">Reset Progress Data</h4>
              </div>
              <p className="text-xs text-ink-dim mt-1">
                Keep your saved titles, but reset watched, read, and played progress and history.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['watch', 'read', 'play', 'all'] as const).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => {
                    if (confirmScope === scope) {
                      selectiveReset(scope);
                      setConfirmScope(null);
                    } else {
                      setConfirmScope(scope);
                    }
                  }}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    confirmScope === scope
                      ? 'bg-red-500/20 border-red-400 text-red-300'
                      : 'bg-background border-white/10 text-ink-dim hover:text-ink'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {confirmScope === scope
                      ? 'Confirm?'
                      : scope === 'watch'
                        ? 'Reset Watch'
                        : scope === 'read'
                          ? 'Reset Read'
                          : scope === 'play'
                            ? 'Reset Play'
                            : 'Reset All'}
                  </span>
                </button>
              ))}
            </div>

            <div className="pt-3 border-t border-white/8">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <h4 className="text-sm font-semibold text-ink">Remove All Data</h4>
              </div>
              <p className="text-xs text-ink-dim mt-1 mb-2.5">
                Erase every title, progress log, diary entry, custom list, and local sync link to
                start completely from scratch.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (confirmScope === 'wipe') {
                    clearAllData();
                    setConfirmScope(null);
                    setSettingsOpen(false);
                  } else {
                    setConfirmScope('wipe');
                  }
                }}
                className={`w-full py-2.5 px-3.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                  confirmScope === 'wipe'
                    ? 'bg-red-500/25 border-red-400 text-red-200'
                    : 'bg-red-500/10 border-red-400/25 text-red-300 hover:bg-red-500/15'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {confirmScope === 'wipe' ? 'Confirm remove all data?' : 'Remove all data'}
                </span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
