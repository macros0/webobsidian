import {loadPlugins,usePluginStates} from '../lib/plugins';
import { useEffect, useRef, useState } from 'react';
import { useStore,resetDraftScope } from '../lib/store';
import { api } from '../lib/api';
import { themeClass } from '../lib/theme';
import Icon from './Icon';
import CodeFileViewerSettings from './CodeFileViewerSettings';
import {defaultCodeFileViewer} from '../lib/codeFiles';
import ToolbarSettings from './toolbar/ToolbarSettings';
import {useIndexStatus,indexStatusMessage,refreshIndexStatus,resetIndexStatus} from '../lib/indexStatus';
import {useVaultPreferences,getVaultPreferences,resetVaultPreferences,importMobileToolbarCommands,mobileToolbarCommandMappings} from '../lib/vaultPreferences';

type Section = 'vault' | 'git' | 'api' | 'sharing' | 'plugins' | 'appearance' | 'toolbar' | 'codeFiles' | 'account' | 'about';

export default function Settings() {
  const open = useStore((s) => s.settingsOpen);
  const setOpen = useStore((s) => s.setSettings);
  const [section, setSection] = useState<Section>('vault');
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    if (open) api.getSettings().then(setSettings).catch(() => {});
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-bg" onClick={() => setOpen(false)}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-layout">
          <div className="settings-nav">
            {(['vault', 'git', 'api', 'sharing', 'plugins', 'appearance', 'toolbar', 'codeFiles', 'account', 'about'] as Section[]).map((s) => (
              <button key={s} className={section === s ? 'active' : ''} onClick={() => setSection(s)}>
                {labels[s]}
              </button>
            ))}
          </div>
          <div className="settings-content">
            {settings && section === 'vault' && <VaultSettings s={settings} reload={() => api.getSettings().then(setSettings)} />}
            {settings && section === 'git' && <GitSettings s={settings} reload={() => api.getSettings().then(setSettings)} />}
            {section === 'api' && <ApiKeys />}
            {section === 'sharing' && <Shares />}
            {section === 'plugins' && <Plugins />}
            {settings && section === 'appearance' && <Appearance s={settings} />}
            {settings && section === 'toolbar' && <ToolbarSettings value={settings.ui.editingToolbar} onSaved={(editingToolbar) => setSettings((current: any) => ({...current, ui:{...current.ui, editingToolbar}}))} />}
            {section === 'account' && <AccountSettings s={settings} reload={() => api.getSettings().then(setSettings)} />}
            {settings && section === 'codeFiles' && <CodeFileViewerSettings value={settings.ui.codeFileViewer??defaultCodeFileViewer} onSave={async next=>{await useStore.getState().applyCodeFileViewerSettings(next);setSettings(await api.getSettings());}}/>}
            {section === 'about' && <About />}
          </div>
        </div>
      </div>
    </div>
  );
}

const labels: Record<Section, string> = {
  vault: 'Vault & Files',
  git: 'GitHub Sync',
  api: 'API Keys',
  sharing: 'Sharing',
  plugins: 'Community Plugins',
  appearance: 'Appearance',
  toolbar: 'Editing toolbar',
  codeFiles:'Code files',
  account: 'Account',
  about: 'About',
};

function Row({ name, desc, children }: { name: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="setting-row">
      <div className="info">
        <div className="name">{name}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <div className="control">{children}</div>
    </div>
  );
}

function IndexSettings(){
  const {status}=useIndexStatus();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{refreshIndexStatus().catch(()=>setError('Could not load index status.'));},[]);
  const run=async(mode:'reconcile'|'rebuild')=>{
    setBusy(true);setError('');
    try{await api.indexJob(mode);await refreshIndexStatus();}
    catch{setError('Could not start index update. Check the connection and try again.');}
    finally{setBusy(false);}
  };
  return <section aria-label="Search index" style={{marginBottom:20}}>
    <Row name="Search index" desc={status?`${status.indexedNotes} notes · ${status.watcherMode} · ${status.pendingPaths} pending`:'Loading index status…'}>
      <span role="status">{status?.phase==='ready'&&!status.persistenceError?'Up to date':indexStatusMessage(status)}</span>
    </Row>
    {status?.lastReconcileAt&&<div className="desc">Last check: {new Date(status.lastReconcileAt).toLocaleString()}</div>}
    {error&&<div role="alert">{error}</div>}
    <div style={{display:'flex',gap:8,marginTop:8}}>
      <button className="btn secondary" disabled={busy} onClick={()=>run('reconcile')}>Check for changes</button>
      <button className="btn secondary" disabled={busy} onClick={()=>run('rebuild')}>Rebuild index</button>
    </div>
  </section>;
}

function VaultSettings({ s, reload }: { s: any; reload: () => Promise<unknown> }) {
  const preferences=useVaultPreferences();
  const autoReveal = useStore((st) => st.autoReveal);
  const setAutoReveal = useStore((st) => st.setAutoReveal);
  const showAttachmentFolders = useStore((st) => st.showAttachmentFolders);
  const setShowAttachmentFolders = useStore((st) => st.setShowAttachmentFolders);
  const [path, setPath] = useState(s.vault.path);
  const [deleteMode, setDeleteMode] = useState(s.vault.deleteMode ?? 'trash');
  const [retention, setRetention] = useState(String(s.vault.trashRetentionDays ?? 0));
  const confirmedDeleteMode=useRef(s.vault.deleteMode??'trash');
  const confirmedRetention=useRef(s.vault.trashRetentionDays??0);
  const [following,setFollowing]=useState(!!s.vault.followObsidianDeletion);
  const [browser, setBrowser] = useState<any>(null);
  const [saving,setSaving]=useState<string|null>(null);
  const [errors,setErrors]=useState<Record<string,string>>({});
  useEffect(()=>{confirmedDeleteMode.current=s.vault.deleteMode??'trash';setDeleteMode(confirmedDeleteMode.current);},[s.vault.deleteMode]);
  useEffect(()=>{confirmedRetention.current=s.vault.trashRetentionDays??0;setRetention(String(confirmedRetention.current));},[s.vault.trashRetentionDays]);
  useEffect(()=>{setPath(s.vault.path);},[s.vault.path]);
  useEffect(()=>{setFollowing(!!s.vault.followObsidianDeletion);},[s.vault.followObsidianDeletion]);
  const errorFor=(field:string,error:unknown)=>setErrors(e=>({...e,[field]:error instanceof Error?error.message:String(error)}));
  const clearError=(field:string)=>setErrors(e=>({...e,[field]:''}));
  // Whole days, 0 (keep forever) … 3650. Invalid input snaps back to the saved value.
  const saveRetention = async () => {
    const n = Number(retention);
    const saved = confirmedRetention.current;
    if (!Number.isInteger(n) || n < 0 || n > 3650) {
      setRetention(String(saved));
      errorFor('retention','Enter whole days from 0 to 3650.');
      return;
    }
    if (n === saved) return;
    setSaving('retention');clearError('retention');
    let committed=false;
    try{await api.putSettings({ vault: { trashRetentionDays: n } });committed=true;confirmedRetention.current=n;await reload();}
    catch(error){setRetention(String(confirmedRetention.current));errorFor('retention',committed?`Saved, but could not refresh: ${String(error)}`:error);}
    finally{setSaving(null);}
  };
  const save = async () => {
    if(!path.trim()){errorFor('path','Vault path must not be blank.');return;}
    setSaving('path');clearError('path');
    try {
      await useStore.getState().save();
      await api.putSettings({ vault: { path } });
      resetIndexStatus();
      refreshIndexStatus().catch(()=>{});
      resetDraftScope();
      resetVaultPreferences(path);
      void getVaultPreferences().catch(()=>{});
      useStore.setState({tabs:[],activePath:null,content:'',dirty:false,splitPath:null,splitContent:''});
      await useStore.getState().loadTree();
      await reload();
      useStore.getState().notify('Vault changed. Local drafts remain scoped to the previous vault.');
    }catch(error){errorFor('path',error);}
    finally{setSaving(null);}
  };
  const saveDeleteMode = async (mode: string) => {
    setDeleteMode(mode);
    setSaving('deleteMode');clearError('deleteMode');
    let committed=false;
    try{await api.putSettings({ vault: { deleteMode: mode } });committed=true;confirmedDeleteMode.current=mode;await Promise.all([reload(),getVaultPreferences()]);}
    catch(error){setDeleteMode(confirmedDeleteMode.current);errorFor('deleteMode',committed?`Saved, but could not refresh: ${String(error)}`:error);}
    finally{setSaving(null);}
  };
  const followObsidianDeletion=async(follow:boolean)=>{
    setSaving('deletionSource');clearError('deletionSource');
    try{await api.putSettings({vault:{followObsidianDeletion:follow}});setFollowing(follow);await Promise.all([reload(),getVaultPreferences()]);}
    catch(error){errorFor('deletionSource',error);}
    finally{setSaving(null);}
  };
  const importToolbar=async()=>{
    setSaving('toolbar');clearError('toolbar');
    try{const imported=importMobileToolbarCommands(s.ui.editingToolbar,preferences.values.mobileToolbarCommands);await api.putSettings({ui:{editingToolbar:imported.config}});window.dispatchEvent(new CustomEvent('editing-toolbar-config',{detail:imported.config}));await reload();}
    catch(error){errorFor('toolbar',error);}
    finally{setSaving(null);}
  };
  const browse = async (dir?: string) => setBrowser(await api.browse(dir).catch((e) => ({ error: e.message })));
  return (
    <div>
      <h2>Vault & Files</h2>
      <IndexSettings />
      <Row name="Vault path" desc="Absolute path on the server to your notes folder">
        <input className="text-input" style={{ width: 260 }} value={path} onChange={(e) => setPath(e.target.value)} />
      </Row>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <button className="btn secondary" onClick={() => browse()}>Browse…</button>
        <button className="btn" disabled={!!saving} onClick={save}>Save vault path</button>
      </div>
      {errors.path&&<p role="alert">{errors.path}</p>}
      {browser && !browser.error && (
        <div style={{ border: '1px solid var(--bg-modifier-border)', borderRadius: 6, padding: 8, marginTop: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{browser.dir}</div>
          <div className="result" onClick={() => browse(browser.parent)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="folder" size={15} /> ..
          </div>
          {browser.folders.map((f: any) => (
            <div className="result" key={f.path} onClick={() => browse(f.path)} onDoubleClick={() => setPath(f.path)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="folder" size={15} /> {f.name}
              <button className="btn secondary" style={{ float: 'right', padding: '2px 8px' }} onClick={(e) => { e.stopPropagation(); setPath(f.path); }}>
                Select
              </button>
            </div>
          ))}
        </div>
      )}
      {browser?.error && <div style={{ color: '#e5534b' }}>{browser.error}</div>}
      <Row
        name="When deleting a file"
        desc="Move to .trash keeps a recoverable copy (Open trash to restore). Permanently delete removes it immediately."
      >
        <select
          className="text-input"
          style={{ width: 220 }}
          value={deleteMode}
          disabled={!!saving||following}
          onChange={(e) => saveDeleteMode(e.target.value)}
        >
          <option value="trash">Move to .trash (recoverable)</option>
          <option value="permanent">Permanently delete</option>
        </select>
      </Row>
      {errors.deleteMode&&<p role="alert">{errors.deleteMode}</p>}
      <Row name="Follow Obsidian deletion" desc={`Explicit opt-in. Obsidian requests ${preferences.values.trashOption==='none'?'permanent deletion':preferences.values.trashOption==='system'?'system trash; this server uses recoverable .trash':'recoverable .trash'}. Your saved WebObsidian selection is retained when following is disabled.`}>
        <input aria-label="Follow Obsidian deletion" type="checkbox" checked={following} disabled={!!saving||preferences.loading||!!preferences.error} onChange={e=>void followObsidianDeletion(e.target.checked)}/>
      </Row>
      {errors.deletionSource&&<p role="alert">{errors.deletionSource}</p>}
      <p>Effective deletion: {preferences.values.deleteMode==='trash'?'move to .trash (recoverable)':'permanently delete'} · source: {preferences.sources.deleteMode}</p>
      <Row
        name="Show attachment folders"
        desc={'Show existing folders named "attachments" and the separate attachment folder selected in Obsidian. This only changes visibility, not the upload location. The vault root and folders containing notes or canvases are always shown.'}
      >
        <input
          type="checkbox"
          checked={showAttachmentFolders}
          onChange={(e) => setShowAttachmentFolders(e.target.checked)}
        />
      </Row>
      <Row
        name="Reveal active file in explorer"
        desc={showAttachmentFolders?'Opening or switching documents expands parent folders and reveals the active file.':'Opening or switching documents reveals visible files. Files inside hidden attachment folders cannot be revealed; enable Show attachment folders to reveal them.'}
      >
        <input
          type="checkbox"
          checked={autoReveal}
          onChange={(e) => setAutoReveal(e.target.checked)}
        />
      </Row>
      <Row
        name="Trash retention (days)"
        desc="Items in .trash are permanently deleted this many days after they were moved there. 0 keeps them forever."
      >
        <input
          className="text-input"
          type="number"
          min={0}
          max={3650}
          step={1}
          style={{ width: 90 }}
          value={retention}
          disabled={!!saving}
          onChange={(e) => setRetention(e.target.value)}
          onBlur={saveRetention}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
      </Row>
      {errors.retention&&<p role="alert">{errors.retention}</p>}
      {saving&&<p role="status">Saving…</p>}
      <details open><summary>Effective vault preferences</summary>
        <p>Portable rules are read from this vault’s .obsidian/app.json. Changes are checked every three seconds. WebObsidian interface visibility is saved separately.</p>
        {preferences.loading&&<p role="status">Loading vault preferences…</p>}
        {preferences.error&&<p role="alert">{preferences.error}</p>}
        {preferences.warnings.map((warning,i)=><p role="alert" key={i}>{warning}</p>)}
        <table className="vault-preferences-table"><thead><tr><th>Preference</th><th>Value</th><th>Source / behavior</th></tr></thead><tbody>
          {Object.entries(preferences.values).map(([key,value])=><tr key={key}><td>{key}</td><td>{key==='attachmentFolderPath'&&preferences.blocked?.attachmentUpload?'Unavailable — uploads blocked':Array.isArray(value)?value.join(', ')||'(empty)':String(value)}</td><td>{key==='attachmentFolderPath'&&preferences.blocked?.attachmentUpload?'Configuration error':preferences.sources[key as keyof typeof preferences.sources]}{key==='deleteUnlinkedAttachments'?' · unused attachments when deleting a note':key==='mobileToolbarCommands'?' · explicit import below':''}</td></tr>)}
        </tbody></table>
      </details>
      <details><summary>Import Obsidian mobile toolbar commands</summary>
        <p>Explicitly add supported commands to the existing mobile toolbar. Existing commands, other layouts, appearance and custom commands are preserved. Unknown commands remain in Obsidian and are not imported.</p>
        <table className="vault-preferences-table"><thead><tr><th>Obsidian command</th><th>WebObsidian command</th></tr></thead><tbody>{preferences.values.mobileToolbarCommands.map((id,i)=><tr key={i}><td>{id}</td><td>{mobileToolbarCommandMappings[id]?`editing-toolbar:${mobileToolbarCommandMappings[id]}`:'Unsupported'}</td></tr>)}</tbody></table>
        <button className="btn secondary" disabled={!!saving||!preferences.values.mobileToolbarCommands.some(id=>mobileToolbarCommandMappings[id])} onClick={()=>void importToolbar()}>Add supported Obsidian mobile commands</button>
        {errors.toolbar&&<p role="alert">{errors.toolbar}</p>}
      </details>
    </div>
  );
}

function GitSettings({ s, reload }: { s: any; reload: () => void }) {
  const [g, setG] = useState({ ...s.git });
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<HTMLTextAreaElement>(null);
  const set = (k: string, v: any) => setG((p: any) => ({ ...p, [k]: v }));
  // Append timestamped lines to the running log instead of replacing it, so the
  // textarea keeps a history of every git action across clicks.
  const append = (lines: string[]) => {
    const ts = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, ...lines.map((l, i) => (i === 0 ? `[${ts}] ${l}` : `         ${l}`))]);
  };
  // Auto-scroll to the newest line whenever the log grows.
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);
  const save = async () => { await api.putSettings({ git: g }); await reload(); append(['Saved git settings']); };
  const run = async (fn: () => Promise<any>, label: string) => {
    append([`${label}…`]);
    try {
      const r = await fn();
      // sync returns { ok, log: string[] }; others return { message }. Split any
      // embedded newlines so multi-line git output renders one line per row.
      const lines: string[] = Array.isArray(r?.log)
        ? [`${label} ${r.ok ? 'ok' : 'NOT ok'}`, ...r.log]
        : [String(r?.message ?? JSON.stringify(r))];
      append(lines.flatMap((l) => String(l).split('\n')));
    } catch (e: any) { append([`Error: ${e.message}`]); }
  };
  return (
    <div>
      <h2>GitHub Sync</h2>
      <Row name="Enable git sync"><input type="checkbox" checked={g.enabled} onChange={(e) => set('enabled', e.target.checked)} /></Row>
      <Row name="Remote URL" desc="https://github.com/owner/repo.git">
        <input className="text-input" style={{ width: 260 }} value={g.remote} onChange={(e) => set('remote', e.target.value)} />
      </Row>
      <Row name="Branch"><input className="text-input" style={{ width: 120 }} value={g.branch} onChange={(e) => set('branch', e.target.value)} /></Row>
      <Row name="Access token (PAT)" desc="Stored server-side; leave masked to keep current">
        <input className="text-input" type="password" style={{ width: 260 }} value={g.token} onChange={(e) => set('token', e.target.value)} />
      </Row>
      <Row name="Author name"><input className="text-input" value={g.authorName} onChange={(e) => set('authorName', e.target.value)} /></Row>
      <Row name="Author email"><input className="text-input" value={g.authorEmail} onChange={(e) => set('authorEmail', e.target.value)} /></Row>
      <Row name="Auto-sync" desc="Periodic pull+commit+push on the interval below"><input type="checkbox" checked={g.autoSync} onChange={(e) => set('autoSync', e.target.checked)} /></Row>
      <Row name="Auto-commit on save" desc="Commit (+push) ~5s after each edit"><input type="checkbox" checked={g.autoCommitOnSave} onChange={(e) => set('autoCommitOnSave', e.target.checked)} /></Row>
      <Row name="Interval (sec)"><input className="text-input" type="number" style={{ width: 90 }} value={g.intervalSec} onChange={(e) => set('intervalSec', Number(e.target.value))} /></Row>
      <Row name="Git LFS patterns" desc="Space-separated globs tracked via LFS">
        <input className="text-input" style={{ width: 260 }} value={(g.lfsPatterns || []).join(' ')} onChange={(e) => set('lfsPatterns', e.target.value.split(/\s+/).filter(Boolean))} />
      </Row>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn" onClick={save}>Save</button>
        <button className="btn secondary" onClick={() => run(api.gitInit, 'Init')}>Init repo</button>
        <button className="btn secondary" onClick={() => run(api.gitClone, 'Clone')}>Clone</button>
        <button className="btn secondary" onClick={() => run(api.gitPull, 'Pull')}>Pull</button>
        <button className="btn secondary" onClick={() => run(() => api.gitCommit(), 'Commit')}>Commit</button>
        <button className="btn secondary" onClick={() => run(api.gitPush, 'Push')}>Push</button>
        <button className="btn" onClick={() => run(() => api.gitSync(), 'Sync')}>Sync now</button>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sync log</span>
          {log.length > 0 && (
            <button className="btn secondary" style={{ padding: '2px 8px' }} onClick={() => setLog([])}>Clear</button>
          )}
        </div>
        <textarea
          ref={logRef}
          readOnly
          value={log.length ? log.join('\n') : 'No git activity yet. Click an action above (Sync now, Pull, Push…) to see logs here.'}
          style={{
            width: '100%', height: 200, boxSizing: 'border-box', resize: 'vertical',
            background: 'var(--bg-primary)', color: 'var(--text-normal)',
            border: '1px solid var(--bg-modifier-border, #444)', borderRadius: 6, padding: 10,
            fontFamily: 'var(--font-monospace, monospace)', fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre',
          }}
        />
      </div>
    </div>
  );
}

function ApiKeys() {
  const [keys, setKeys] = useState<any[]>([]);
  const [name, setName] = useState('my-agent');
  const [scopes, setScopes] = useState<string[]>(['read', 'search']);
  const [created, setCreated] = useState('');
  const load = () => api.listKeys().then((r) => setKeys(r.keys)).catch(() => {});
  useEffect(() => { load(); }, []);
  const toggle = (sc: string) => setScopes((p) => (p.includes(sc) ? p.filter((x) => x !== sc) : [...p, sc]));
  const create = async () => {
    const r = await api.createKey(name, scopes);
    setCreated(r.key);
    await load();
  };
  return (
    <div>
      <h2>API Keys</h2>
      <p style={{ color: 'var(--text-muted)' }}>Keys let AI agents call <code>/api/v1</code>. The raw key is shown once.</p>
      <Row name="Name"><input className="text-input" value={name} onChange={(e) => setName(e.target.value)} /></Row>
      <Row name="Scopes">
        <span>
          {['read', 'write', 'search'].map((sc) => (
            <label key={sc} style={{ marginRight: 10 }}>
              <input type="checkbox" checked={scopes.includes(sc)} onChange={() => toggle(sc)} /> {sc}
            </label>
          ))}
        </span>
      </Row>
      <button className="btn" onClick={create}>Create key</button>
      {created && (
        <pre style={{ background: 'var(--bg-primary)', padding: 10, borderRadius: 6, marginTop: 10, wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
          {created}
          {'\n'}⚠ Copy now — it will not be shown again.
        </pre>
      )}
      <div style={{ marginTop: 16 }}>
        {keys.map((k) => (
          <div className="setting-row" key={k.id}>
            <div className="info">
              <div className="name">{k.name} <span style={{ color: 'var(--text-faint)' }}>{k.prefix}…</span></div>
              <div className="desc">scopes: {k.scopes.join(', ')} · used: {k.lastUsed ?? 'never'}</div>
            </div>
            <button className="btn danger" onClick={async () => { await api.revokeKey(k.id); load(); }}>Revoke</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Shares() {
  const notify = useStore((s) => s.notify);
  const openFile = useStore((s) => s.openFile);
  const setOpen = useStore((s) => s.setSettings);
  // Shared with the store so the file tree's globe badges refresh on changes.
  const shares = useStore((s) => s.shares);
  const load = useStore((s) => s.loadShares);
  const [query, setQuery] = useState('');
  useEffect(() => { load(); }, [load]);

  const url = (id: string) => `${location.origin}/share/${id}`;
  const copy = (id: string) => {
    navigator.clipboard?.writeText(url(id)).catch(() => {});
    notify('Public link copied');
  };
  const toggle = async (s: any) => {
    await api.setShareEnabled(s.id, !s.enabled);
    load();
  };
  const remove = async (s: any) => {
    if (!confirm(`Delete the public link for "${s.path}"? The URL stops working permanently.`)) return;
    await api.deleteShare(s.id);
    load();
  };
  const setPassword = async (s: any) => {
    const pw = prompt(
      s.hasPassword
        ? 'New password for this link (leave empty to REMOVE the password):'
        : 'Password for this link:',
    );
    if (pw === null) return;
    await api.setSharePassword(s.id, pw || null);
    notify(pw ? 'Password set' : 'Password removed');
    load();
  };

  const q = query.trim().toLowerCase();
  const filtered = q ? shares.filter((s) => s.path.toLowerCase().includes(q)) : shares;

  return (
    <div>
      <h2>Sharing</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Notes shared via a public link are readable by <b>anyone with the URL</b>, without login.
        Create a link from a note's context menu ("Share…"). Disable keeps the URL for
        re-enabling later; delete revokes it permanently.
      </p>
      <input
        className="text-input"
        style={{ width: '100%', margin: '6px 0 12px' }}
        placeholder="Search shared notes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 && (
        <div style={{ color: 'var(--text-faint)' }}>
          {shares.length === 0 ? 'No notes are shared publicly.' : 'No shared note matches the search.'}
        </div>
      )}
      {filtered.map((s) => (
        <div className="setting-row" key={s.id}>
          <div className="info" style={{ minWidth: 0 }}>
            <div
              className="name"
              style={{ cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: s.enabled ? 1 : 0.55 }}
              title={`Open ${s.path}`}
              onClick={() => { openFile(s.path); setOpen(false); }}
            >
              {s.path}
            </div>
            <div className="desc">
              {s.enabled ? 'active' : 'disabled'}
              {s.hasPassword ? ' · password-protected' : ''} · created {new Date(s.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
            <button className="btn secondary" disabled={!s.enabled} onClick={() => copy(s.id)} title={url(s.id)}>
              <Icon name="link" size={14} /> Copy link
            </button>
            <button className="btn secondary" onClick={() => setPassword(s)} title={s.hasPassword ? 'Change or remove password' : 'Require a password to open the link'}>
              {s.hasPassword ? 'Password ✓' : 'Password…'}
            </button>
            <button className={`btn ${s.enabled ? 'secondary' : ''}`} onClick={() => toggle(s)}>
              {s.enabled ? 'Disable' : 'Enable'}
            </button>
            <button className="btn danger" onClick={() => remove(s)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Plugins() {
  const runtimeStates=usePluginStates();
  const [plugins, setPlugins] = useState<any[]>([]);
  const [repo, setRepo] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api.listPlugins().then((r) => setPlugins(r.plugins)).catch(() => setMsg('Could not load plugin catalog.'));
  useEffect(() => { load(); }, []);
  const install = async () => {
    setMsg('Installing…');
    try { await api.installPlugin(repo); setMsg('Installed ✓'); setRepo(''); await load(); }
    catch (e: any) { setMsg(`Error: ${e.message}`); }
  };
  return (
    <div>
      <h2>Community Plugins</h2>
      <Row name="Install from GitHub" desc="owner/repo — pulls manifest.json + main.js from latest release">
        <span style={{ display: 'flex', gap: 8 }}>
          <input className="text-input" placeholder="blacksmithgu/obsidian-dataview" value={repo} onChange={(e) => setRepo(e.target.value)} />
          <button className="btn" onClick={install}>Install</button>
        </span>
      </Row>
      {msg && <div style={{ color: 'var(--text-muted)', margin: '6px 0' }}>{msg}</div>}
      <div style={{ marginTop: 12 }}>
        {plugins.length === 0 && <div style={{ color: 'var(--text-faint)' }}>No plugins installed</div>}
        {plugins.map((p) => (
          <div className="setting-row" key={p.id}>
            <div className="info">
              <div className="name">{p.name} <span style={{ color: 'var(--text-faint)' }}>v{p.version}</span></div>
              <div className="desc">{p.description}</div><div className="desc">Source: {p.source??'desktop'} · {runtimeStates.find(x=>x.id===p.id)?.state??(p.enabled?'loading':'disabled')}</div>{runtimeStates.find(x=>x.id===p.id)?.failure&&<div role="alert">{runtimeStates.find(x=>x.id===p.id)?.failure?.message}</div>}
            </div>
            <label>
              <input type="checkbox" checked={p.enabled} onChange={async (e) => { try { await api.setPluginEnabled(p.id, e.target.checked); await load(); await loadPlugins(); } catch { setMsg('Could not change plugin state.'); } }} /> enabled
            </label>
          </div>
        ))}
      </div>
      <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 14 }}>
        Note: WebObsidian supports a subset of the Obsidian plugin API. Compatibility is limited. Runtime status shows failures and unsupported APIs; Node/Electron plugins require separate support. Web installations and settings are stored separately from desktop Obsidian.
      </p>
    </div>
  );
}

function Appearance({ s }: { s: any }) {
  const [theme, setTheme] = useState(s.ui.theme);
  const [inlineTitle, setInlineTitle] = useState(s.ui.showInlineTitle !== false);
  const saveInlineTitle = async (v: boolean) => {
    setInlineTitle(v);
    useStore.getState().setShowInlineTitle(v);
    await api.putSettings({ ui: { showInlineTitle: v } });
  };
  // Apply the theme live (no reload — keeps the Settings dialog open), then persist.
  const save = async (t: string) => {
    setTheme(t);
    useStore.getState().setTheme(themeClass(t));
    await api.putSettings({ ui: { theme: t } });
  };
  return (
    <div>
      <h2>Appearance</h2>
      <Row name="Theme">
        <select className="text-input" value={theme} onChange={(e) => save(e.target.value)}>
          <optgroup label="Obsidian">
            <option value="obsidian-dark">Obsidian Dark</option>
            <option value="obsidian-light">Obsidian Light</option>
          </optgroup>
          <optgroup label="Catppuccin">
            <option value="catppuccin-mocha">Catppuccin Mocha</option>
            <option value="catppuccin-macchiato">Catppuccin Macchiato</option>
            <option value="catppuccin-frappe">Catppuccin Frappé</option>
            <option value="catppuccin-latte">Catppuccin Latte</option>
          </optgroup>
        </select>
      </Row>
      <Row name="Show inline title" desc="Display the file name as a title above the note. Turn it off if your notes start with their own heading.">
        <input type="checkbox" checked={inlineTitle} onChange={(e) => saveInlineTitle(e.target.checked)} />
      </Row>
    </div>
  );
}

function AccountSettings({ s, reload }: { s: any; reload: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const usingDefault = !s?.auth?.hasCustomPassword;

  const save = async () => {
    setErr('');
    setMsg('');
    if (next.length < 6) {
      setErr('New password must be at least 6 characters');
      return;
    }
    if (next !== confirm) {
      setErr('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setMsg('Password changed ✓');
      setCurrent('');
      setNext('');
      setConfirm('');
      await reload();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2>Account</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        Your WebObsidian login password.
        {usingDefault && (
          <>
            {' '}You’re using the <b>default password <code>123456</code></b> — change it to secure
            your vault.
          </>
        )}
      </p>
      <Row name="Current password" desc={usingDefault ? 'Defaults to 123456' : undefined}>
        <input className="text-input" type="password" style={{ width: 240 }} value={current}
          onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </Row>
      <Row name="New password" desc="At least 6 characters">
        <input className="text-input" type="password" style={{ width: 240 }} value={next}
          onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </Row>
      <Row name="Confirm new password">
        <input className="text-input" type="password" style={{ width: 240 }} value={confirm}
          onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </Row>
      {err && <div style={{ color: '#e5534b', margin: '6px 0' }}>{err}</div>}
      {msg && <div style={{ color: 'var(--text-accent, #4caf50)', margin: '6px 0' }}>{msg}</div>}
      <button className="btn" onClick={save} disabled={busy || !current || !next}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
      <p style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 16 }}>
        Forgot your password? Set <code>auth.passwordHash</code> in <code>data/settings.json</code>,
        or the <code>WEBOBSIDIAN_PASSWORD</code> environment variable, as a recovery (override)
        password, then log back in to set a new one.
      </p>
    </div>
  );
}

function About() {
  const logout = async () => { await api.logout(); location.reload(); };
  return (
    <div>
      <h2>About WebObsidian</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        A self-hosted, Obsidian-compatible web app. Vault, QMD search, GitHub sync (with LFS),
        agent API and community plugins.
      </p>
      <button className="btn danger" onClick={logout}>Log out</button>
    </div>
  );
}
