import React,{useEffect,useRef,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import type {EditorView} from '@codemirror/view';
import Icon,{type IconName} from '../Icon';
import {themedPopupHost} from '../../lib/theme';
import {api} from '../../lib/api';
import {useStore} from '../../lib/store';
import {getActiveEditor} from '../../lib/activeEditor';
import {captureContext,isContextCurrent,executeCommand,getCommand,setToolbarServices,registerTemplate,applyBrush,cancelBrush,stickyBrush,type ToolbarContext,type DialogField} from '../../lib/toolbar/registry';
import {getDefaultToolbarConfig,parseToolbarConfig,type ToolbarNode,type ToolbarConfigV1} from '../../lib/toolbar/config';
import ColorControls from '../ColorControls';

let config:ToolbarConfigV1|null=null,loading=false;
const configListeners=new Set<()=>void>();
function publishConfig(c:unknown){config=parseToolbarConfig(c);for(const fn of configListeners)fn();}
function useConfig(){const [value,setValue]=useState(()=>config??getDefaultToolbarConfig());useEffect(()=>{const fn=()=>setValue(config??getDefaultToolbarConfig());configListeners.add(fn);const reload=()=>{api.getSettings().then(s=>publishConfig(s.ui?.editingToolbar)).catch(()=>{});};if(!loading){loading=true;reload();}window.addEventListener('editing-toolbar-config',reload);return()=>{configListeners.delete(fn);window.removeEventListener('editing-toolbar-config',reload);};},[]);return value;}
if(typeof window!=='undefined')window.addEventListener('toolbar-layout-action',async event=>{
 const id=(event as CustomEvent<string>).detail;
 const next=parseToolbarConfig(config??getDefaultToolbarConfig());
 if(id==='show-toolbar')next.layouts.top.enabled=true;
 else if(id==='hide-toolbar')for(const v of Object.values(next.layouts))v.enabled=false;
 else if(id==='toggle-toolbar')next.layouts.top.enabled=!next.layouts.top.enabled;
 else {const layout=id.slice(7) as 'top'|'following'|'fixed';if(next.layouts[layout])next.layouts[layout].enabled=!next.layouts[layout].enabled;}
 try {await api.putSettings({ui:{editingToolbar:next}});publishConfig(next);}catch(error){useStore.getState().notify(String(error));}
});
let overlayRoot:Root|null=null,overlayHost:HTMLDivElement|null=null,cleanup=()=>{};
let activeTriggerId:string|null=null;
let cancelPending:(()=>void)|null=null;
let escapeLayer:(()=>boolean)|null=null;
function closeOverlay(){activeTriggerId=null;const cancel=cancelPending;cancelPending=null;escapeLayer=null;cleanup();cleanup=()=>{};overlayRoot?.render(null);cancel?.();}
if(typeof window!=='undefined')window.addEventListener('toolbar-open-color',closeOverlay);
export function hasToolbarOverlay(){return !!overlayHost?.childElementCount;}
function showOverlay(element:React.ReactNode,ctx?:ToolbarContext,onCancel?:()=>void){
 window.dispatchEvent(new Event('toolbar-close-colors'));closeOverlay();if(!overlayHost){overlayHost=document.createElement('div');overlayHost.className='toolbar-overlay-host';overlayRoot=createRoot(overlayHost);} (document.fullscreenElement??themedPopupHost()).appendChild(overlayHost);
 const previous=document.activeElement as HTMLElement|null;
 const cancel=()=>{closeOverlay();onCancel?.();if(previous?.isConnected)previous.focus();};
 const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(!escapeLayer?.())cancel();}};
 const outside=(e:PointerEvent)=>{if(!overlayHost?.contains(e.target as Node)&&!(e.target as HTMLElement).closest('[data-toolbar-trigger]'))cancel();};
 document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',outside);
 const wasReadOnly=ctx?.view.state.readOnly;
 const timer=ctx?setInterval(()=>{if(!isContextCurrent(ctx)||ctx.view.state.readOnly&&!wasReadOnly)cancel();},100):undefined;
 cleanup=()=>{clearInterval(timer);document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',outside);};
 cancelPending=onCancel??null;overlayRoot!.render(element);
}
function Dialog({title,fields,resolve,preview}:{title:string;fields:DialogField[];resolve:(v:Record<string,string>|null)=>void;preview?:(p:Record<string,string>)=>string}){
 const [values,setValues]=useState(Object.fromEntries(fields.map(f=>[f.key,f.value])));const ref=useRef<HTMLFormElement>(null);
 useEffect(()=>{ref.current?.querySelector<HTMLElement>('input,textarea,button')?.focus();},[]);
 return <div className="toolbar-dialog-bg" onPointerDown={e=>{if(e.target===e.currentTarget)resolve(null);}}><form ref={ref} className="toolbar-dialog" role="dialog" aria-modal="true" aria-label={title} onSubmit={e=>{e.preventDefault();resolve(values);}} onKeyDown={e=>{
 if(e.key==='Tab'){const all=Array.from(ref.current!.querySelectorAll<HTMLElement>('input,textarea,button'));if(e.shiftKey&&document.activeElement===all[0]){e.preventDefault();all.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===all.at(-1)){e.preventDefault();all[0]?.focus();}}
 }}><h3>{title}</h3>{fields.map(f=><label key={f.key}>{f.label}<textarea aria-label={f.label} value={values[f.key]} onChange={e=>setValues({...values,[f.key]:e.target.value})}/></label>)}{preview&&<details open><summary>Preview</summary><pre>{preview(values)}</pre></details>}<footer><button type="button" onClick={()=>resolve(null)}>Cancel</button><button type="submit">Apply</button></footer></form></div>;
}
export function promptToolbar(title:string,fields:DialogField[],preview?:(p:Record<string,string>)=>string,ctx?:ToolbarContext){
 return new Promise<Record<string,string>|null>(resolve=>{let done=false;const finish=(v:Record<string,string>|null)=>{if(done)return;done=true;closeOverlay();resolve(v);};showOverlay(<Dialog title={title} fields={fields} preview={preview} resolve={finish}/>,ctx,()=>finish(null));});
}
function Menu({nodes,ctx,anchor,compact=false}:{nodes:ToolbarNode[];ctx:ToolbarContext;anchor:DOMRect;compact?:boolean}){
 const [path,setPath]=useState<ToolbarNode[][]>([nodes]);const ref=useRef<HTMLDivElement>(null);const [pos,setPos]=useState({left:anchor.left,top:anchor.bottom+5});
 useEffect(()=>{const reposition=()=>{const r=ref.current?.getBoundingClientRect();const vv=window.visualViewport;const x=vv?.offsetLeft??0,y=vv?.offsetTop??0,w=vv?.width??innerWidth,h=vv?.height??innerHeight;setPos({left:Math.max(x+6,Math.min(anchor.left,x+w-(r?.width??240)-6)),top:anchor.bottom+(r?.height??240)<y+h?anchor.bottom+5:Math.max(y+6,anchor.top-(r?.height??240)-5)});};reposition();window.addEventListener('resize',reposition);document.addEventListener('scroll',reposition,true);ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();return()=>{window.removeEventListener('resize',reposition);document.removeEventListener('scroll',reposition,true);};},[path,anchor]);
 useEffect(()=>{escapeLayer=()=>{if(path.length>1){setPath(path.slice(0,-1));return true;}return false;};return()=>{escapeLayer=null;};},[path]);
 const current=path.at(-1)!;
 return <div ref={ref} role="menu" aria-label="Formatting menu" className={'toolbar-popover'+(compact?' compact':'')} style={pos} onPointerDown={e=>{if(!(e.target as HTMLElement).closest('textarea,input'))e.preventDefault();}} onKeyDown={e=>{
 const all=Array.from(ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const at=all.indexOf(document.activeElement as HTMLButtonElement);
 if(e.key==='ArrowRight'&&(document.activeElement as HTMLElement)?.getAttribute('aria-haspopup')==='menu'){e.preventDefault();(document.activeElement as HTMLButtonElement).click();return;}
 if(['ArrowDown','ArrowRight','ArrowUp','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft'&&path.length>1)setPath(path.slice(0,-1));else (e.key==='Home'?all[0]:e.key==='End'?all.at(-1):all[(at+(e.key==='ArrowUp'?-1:1)+all.length)%all.length])?.focus();}
 if(e.key==='Tab')closeOverlay();
 }}>
 {path.length>1&&<button role="menuitem" onClick={()=>setPath(path.slice(0,-1))}>← Back</button>}
 {current.map(n=>n.type==='separator'?<hr key={n.instanceId}/>:n.type==='group'?<button key={n.instanceId} role="menuitem" aria-haspopup="menu" onClick={()=>setPath([...path,n.children])}><Icon name={(n.icon??'more-horizontal') as IconName} size={16}/>{n.label}<span>›</span></button>:<CommandButton key={n.instanceId} node={n} ctx={ctx} menu compact={compact}/>)}
 </div>;
}
function CommandButton({node,ctx,menu=false,compact=false}:{node:Extract<ToolbarNode,{type:'command'}>;ctx:ToolbarContext|null;menu?:boolean;compact?:boolean}){
 if(node.commandId.endsWith('change-font-color')||node.commandId.endsWith('change-background-color'))return <ColorControls view={ctx?.view} disabled={!ctx||ctx.view.state.readOnly} customColors={config?.customColors} properties={[node.commandId.endsWith('change-font-color')?'color':'background-color']}/>;
 const cmd=getCommand(node.commandId);const state=ctx&&cmd?cmd.getState(ctx):{enabled:false,active:false};const title=node.label??cmd?.label??node.commandId;return <button type="button" role={menu?'menuitem':undefined} title={node.disabledReason??state.reason??title} aria-label={title} aria-pressed={state.active===true} onDoubleClick={()=>{if(ctx&&node.commandId.endsWith('toggle-format-brush'))void stickyBrush(captureContext(ctx.view));}} disabled={node.disabled||!state.enabled} onPointerDown={e=>e.preventDefault()} onClick={()=>{if(!ctx)return;closeOverlay();void executeCommand(node.commandId,menu?ctx:captureContext(ctx.view)).then(r=>{if(r.reason)useStore.getState().notify(r.reason);});}}><Icon name={(node.icon??cmd?.icon??'type') as IconName} size={16}/>{(!compact)&&<span className={menu?'':'toolbar-command-label'}>{title}</span>}</button>;
}
function attachFile(ctx:ToolbarContext){return new Promise<string|null>(resolve=>{const state=useStore.getState(),path=state.activePath;const input=document.createElement('input');input.type='file';input.oncancel=()=>resolve(null);input.onchange=async()=>{const file=input.files?.[0];if(!file){resolve(null);return;}try{const folder=path?.split('/').slice(0,-1).join('/');const uploaded=await api.upload(file,(folder?folder+'/':'')+'attachments');if(!isContextCurrent(ctx)||useStore.getState().activePath!==path){state.notify('File uploaded: '+uploaded.path+'. Document changed; insert the link manually.');resolve(null);return;}const rel=uploaded.path.split('/').slice(-2).join('/').replace(/ /g,'%20').replace(/\(/g,'%28').replace(/\)/g,'%29');resolve(file.type.startsWith('image/')?'![]('+rel+')':'['+file.name.replace(/\]/g,'\\]')+']('+rel+')');}catch(e){state.notify(String(e));resolve(null);}};input.click();});}
setToolbarServices({prompt:promptToolbar,attach:attachFile,notify:message=>useStore.getState().notify(message)});
export default function ToolbarSurface({view,layout='top',disabled=false}:{view?:EditorView;layout?:'top'|'mobile'|'following'|'fixed';disabled?:boolean}){
 const cfg=useConfig();const [,update]=useState(0);const target=view??getActiveEditor();const ctx=target?captureContext(target):null;
 useEffect(()=>{const timer=setInterval(()=>update(x=>x+1),200);return()=>clearInterval(timer);},[]);
 useEffect(()=>{for(const c of cfg.customCommands)registerTemplate(c.id,c.label,c.prefix,c.suffix);},[cfg]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!hasToolbarOverlay()){cancelBrush();document.body.classList.remove('fullscreen-focus','workplace-fullscreen-focus');}};
 const apply=(e:PointerEvent)=>{const v=view??getActiveEditor();if(v?.contentDOM.contains(e.target as Node)&&!(e.target as HTMLElement).closest('button,.floating-format-toolbar,.toolbar-overlay-host'))setTimeout(()=>{if(!v.state.selection.main.empty)void applyBrush(v);},0);};document.addEventListener('keydown',escape);document.addEventListener('pointerup',apply);return()=>{document.removeEventListener('keydown',escape);document.removeEventListener('pointerup',apply);};},[view]);
 const spec=cfg.layouts[layout];if(!spec.enabled)return null;
 return <span className="toolbar-surface" data-labels={cfg.appearance.showLabels} style={{position:layout==='fixed'?'fixed':undefined,left:layout==='fixed'?Math.min(.95,Math.max(.05,spec.position?.x??.5))*innerWidth:undefined,top:layout==='fixed'?Math.min(.95,Math.max(.05,spec.position?.y??.85))*innerHeight:undefined,transform:layout==='fixed'?'translate(-50%,-50%)':undefined,flexWrap:cfg.appearance.overflow==='wrap'?'wrap':undefined,background:cfg.appearance.backgroundColor,color:cfg.appearance.iconColor,gap:cfg.appearance.density==='compact'?1:4,'--toolbar-icon-size':cfg.appearance.iconSize+'px'} as React.CSSProperties}>{layout==='fixed'&&<button title="Move toolbar" aria-label="Move toolbar" onPointerDown={e=>{
 e.preventDefault();const element=e.currentTarget.parentElement!;let x=spec.position?.x??.5,y=spec.position?.y??.85;
 const move=(event:PointerEvent)=>{x=Math.min(.95,Math.max(.05,event.clientX/innerWidth));y=Math.min(.95,Math.max(.05,event.clientY/innerHeight));element.style.left=x*innerWidth+'px';element.style.top=y*innerHeight+'px';};
 const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);const next=parseToolbarConfig(cfg);next.layouts.fixed.position={x,y};void api.putSettings({ui:{editingToolbar:next}}).then(()=>publishConfig(next)).catch(error=>useStore.getState().notify(String(error)));};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
 }}>⠿</button>}{spec.items.map(n=>n.type==='separator'?<span className="toolbar-separator" key={n.instanceId}/>:n.type==='group'?<button key={n.instanceId} data-toolbar-trigger type="button" title={n.label} aria-label={n.label} aria-haspopup="menu" disabled={!ctx} onPointerDown={e=>e.preventDefault()} onClick={e=>{if(activeTriggerId===layout+':'+n.instanceId){closeOverlay();return;}if(ctx){showOverlay(<Menu nodes={n.children} ctx={captureContext(ctx.view)} anchor={e.currentTarget.getBoundingClientRect()} compact={n.style==='compact'}/>,captureContext(ctx.view));activeTriggerId=layout+':'+n.instanceId;}}}><Icon name={(n.icon??'more-horizontal') as IconName} size={16}/><small>⌄</small></button>:<CommandButton key={n.instanceId} node={n} ctx={ctx}/>)}</span>;
}
