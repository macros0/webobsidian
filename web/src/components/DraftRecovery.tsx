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
 const discard=async(record:DraftRecord)=>{const epoch=draftScopeEpoch();try{if(!await confirmDialog('Delete this local draft?'))return;assertDraftScope(record.scopeId,epoch);await deleteDraftIfRevision(record,record.revision);await refresh();}catch(e){if(epoch===draftScopeEpoch())setError(String(e));}};
 if(!authed)return null;
 return <><div className="draft-status" style={{bottom:viewport.bottom+(viewport.width<=700?60:24),right:viewport.right+12,maxWidth:Math.max(0,viewport.width-24),maxHeight:Math.max(36,viewport.height-80)}}>
 <span role="status">{session?.localError?'Local save failed':session?({modified:'Modified',saving:'Saving…',local:'Saved locally',saved:'Saved on server',conflict:'Conflict',error:'Save failed'}[session.state]):dirty?'Modified':error?'Local drafts unavailable':''}</span>
 {session?.localError&&<button onClick={()=>exportText(session.key.path,session.content)}>Export unsaved text</button>}
 {session?.state==='conflict'&&<button onClick={()=>void compare(session.record())}>Resolve conflict</button>}
 <button onClick={()=>{setExpanded(!expanded);void refresh();}}>Local drafts ({records.length})</button>
 {error&&!expanded&&<span role="alert">{error}</span>}
 {expanded&&<section style={{maxHeight:Math.max(40,viewport.height-160),maxWidth:Math.max(0,viewport.width-24)}} className="draft-list" aria-label="Local drafts"><button onClick={()=>setExpanded(false)}>Close</button>{error&&<p role="alert">{error}</p>}{records.map(r=><div key={[r.scopeId,r.path,r.writerId].join(':')}><strong>{r.path}</strong> <small>{new Date(r.updatedAt).toLocaleString()}</small><button onClick={()=>void compare(r)}>Recover / Compare</button><button onClick={()=>exportText(r.path,r.content)}>Export</button><button onClick={()=>void discard(r)}>Discard</button></div>)}</section>}</div>
 {conflict&&<ConflictResolver session={conflict} onClose={()=>{setConflict(null);void refresh();}}/>}</>;
}
