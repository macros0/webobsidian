import {confirmDialog} from '../lib/confirm';
import {useEffect,useRef,useState} from 'react';
import {useVisualViewport} from '../lib/useVisualViewport';
import {useStore,documentSessions,loadDraftScope,resetDraftScope,draftScopeEpoch,isDraftScopeCurrent,assertDraftScope} from '../lib/store';
import {listDrafts,deleteDraftIfRevision} from '../lib/drafts/storage';
import {loadConflict,type ConflictSession} from '../lib/conflicts';
import type {DraftRecord} from '../lib/drafts/types';
import ConflictResolver from './ConflictResolver';
function exportText(path:string,content:string){const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=path.split('/').pop()||'draft.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function DraftRecovery(){
 const viewport=useVisualViewport();const path=useStore(s=>s.activePath),authed=useStore(s=>s.authed),dirty=useStore(s=>s.dirty);
 const [records,setRecords]=useState<DraftRecord[]>([]),[expanded,setExpanded]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState<ConflictSession|null>(null),[,tick]=useState(0);
 const mounted=useRef(false),request=useRef(0);
 const refresh=async()=>{const epoch=draftScopeEpoch(),id=++request.current;try{
  const scope=await loadDraftScope();const rows=await listDrafts(scope);
  if(mounted.current&&id===request.current&&isDraftScopeCurrent(scope,epoch)){setRecords(rows);setError('');}
 }catch(e){if(mounted.current&&epoch===draftScopeEpoch()&&id===request.current)setError('Local drafts unavailable: '+String(e));}};
 useEffect(()=>{
  mounted.current=true;if(!authed){resetDraftScope();return()=>{mounted.current=false;};}
  const invalidated=()=>{request.current++;setRecords([]);setConflict(null);setExpanded(false);setError('');void refresh();};
  const handler=()=>tick(v=>v+1),changed=()=>void refresh();
  const before=(e:BeforeUnloadEvent)=>{if(useStore.getState().dirty){e.preventDefault();e.returnValue='';}};
  const background=()=>{for(const s of documentSessions.values())if(s.state!=='saved')void s.flush().catch(()=>{});};
  window.addEventListener('draft-scope-change',invalidated);window.addEventListener('draft-status',handler);window.addEventListener('local-drafts-changed',changed);
  window.addEventListener('beforeunload',before);document.addEventListener('visibilitychange',background);const timer=setInterval(changed,3000);void refresh();
  return()=>{mounted.current=false;request.current++;clearInterval(timer);window.removeEventListener('draft-scope-change',invalidated);window.removeEventListener('draft-status',handler);window.removeEventListener('local-drafts-changed',changed);window.removeEventListener('beforeunload',before);document.removeEventListener('visibilitychange',background);};
 },[authed]);
 const session=path?documentSessions.get(path):undefined;
 const compare=async(record:DraftRecord)=>{const epoch=draftScopeEpoch();try{const result=await loadConflict(record);if(mounted.current&&isDraftScopeCurrent(record.scopeId,epoch))setConflict(result);}catch(e){if(mounted.current&&epoch===draftScopeEpoch())setError(String(e));}};
 const discard=async(record:DraftRecord)=>{const epoch=draftScopeEpoch();try{
  if(!await confirmDialog('Remove this browser copy?',{confirmLabel:'Remove copy',danger:true,detail:'This does not delete or change the file in your vault. Only this recovery copy will be removed.'}))return;
  assertDraftScope(record.scopeId,epoch);
  const removed=await deleteDraftIfRevision(record,record.revision);await refresh();
  if(!removed&&isDraftScopeCurrent(record.scopeId,epoch))setError('This copy changed while you were reviewing it. Review the latest text before removing it.');
 }catch(e){if(epoch===draftScopeEpoch())setError(String(e));}};
 if(!authed)return null;
 // A live editor's ordinary autosave is already represented by its save status.
 // Only detached copies and failed/conflicting saves need a recovery action.
 const recoverable=records.filter(record=>{
  const live=documentSessions.get(record.path);
  return !live||live.key.writerId!==record.writerId||['conflict','error','saved'].includes(live.state);
 });
 if(!session&&!dirty&&!error&&!recoverable.length&&!expanded)return null;
 return <><div className="draft-status" style={{bottom:viewport.bottom+(viewport.width<=700?60:24),right:viewport.right+12,maxWidth:Math.max(0,viewport.width-24),maxHeight:Math.max(36,viewport.height-80)}}>
 <span role="status">{session?.localError?'Browser backup failed':session?({modified:'Saving changes…',saving:'Saving to vault…',local:'Backed up in this browser · saving to vault…',saved:'Saved to vault',conflict:'Changes need review',error:'Not saved to vault'}[session.state]):dirty?'Saving changes…':error?'Recovery copies unavailable':''}</span>
 {session?.localError&&<button onClick={()=>exportText(session.key.path,session.content)}>Export unsaved text</button>}
 {session?.state==='conflict'&&<button onClick={()=>void compare(session.record())}>Resolve conflict</button>}
 {(recoverable.length>0||expanded)&&<button aria-expanded={expanded} aria-controls="unsaved-text-recovery" onClick={()=>{setExpanded(!expanded);void refresh();}}>Recover unsaved text ({recoverable.length})</button>}
 {error&&!expanded&&<span role="alert">{error}</span>}
 {expanded&&<section id="unsaved-text-recovery" style={{maxHeight:Math.max(40,viewport.height-160),maxWidth:Math.max(0,viewport.width-24)}} className="draft-list" aria-label="Unsaved text recovery">
  <header><h2>Unsaved text recovery</h2><button onClick={()=>setExpanded(false)}>Close</button></header>
  <p>These browser copies may contain text that was not saved to your vault. You do not need to manage this list during normal editing.</p>
  <p className="draft-list-help">Review a copy to recover text you need, or remove it if you no longer need it. Reviewing does not change or restore a file.</p>
  {error&&<p role="alert">{error}</p>}
  {!recoverable.length&&<p role="status">No text needs recovery. Your current edits are saved automatically.</p>}
  {recoverable.map(r=><article className="draft-recovery-item" key={[r.scopeId,r.path,r.writerId].join(':')}>
   <strong>{r.path}</strong><small>Browser copy · {new Date(r.updatedAt).toLocaleString()}</small>
   <p>{r.state==='conflict'?'This copy could not be saved because the file changed. Review both versions.':r.state==='recovery'?'You left a recovery in progress. Review it to continue.':'This copy was kept for recovery. Review it before deciding whether to keep the text.'}</p>
   <div className="draft-recovery-actions"><button className="btn" onClick={()=>void compare(r)}>Review text</button><button className="btn secondary" onClick={()=>exportText(r.path,r.content)}>Download copy</button><button className="btn secondary" onClick={()=>void discard(r)}>Remove browser copy</button></div>
  </article>)}
 </section>}</div>
 {conflict&&<ConflictResolver session={conflict} onClose={()=>{setConflict(null);void refresh();}}/>}</>;
}
