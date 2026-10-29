import {useState, type Dispatch, type SetStateAction} from 'react';
import {api} from '../../lib/api';
import {getDefaultToolbarConfig,parseToolbarConfig,toolbarSurfaces,toolbarCommandOptions,toolbarIcons,moveToolbarItem,type ToolbarConfigV1,type ToolbarNode,type ToolbarSurface} from '../../lib/toolbar/config';
import {importEditingToolbar,type ImportReport} from '../../lib/toolbar/importConfig';

const newId=()=>`item-${crypto.randomUUID()}`;
function updateNode(nodes:ToolbarNode[],id:string,update:(n:ToolbarNode)=>ToolbarNode|null):ToolbarNode[] {
  return nodes.flatMap(n=>n.instanceId===id?update(n)??[]:n.type==='group'?{...n,children:updateNode(n.children,id,update)}:n);
}
function appendGroup(nodes:ToolbarNode[],id:string,node:ToolbarNode):ToolbarNode[] {
  return nodes.map(n=>n.type==='group'?{...n,children:n.instanceId===id?[...n.children,node]:appendGroup(n.children,id,node)}:n);
}
function countNodes(nodes:ToolbarNode[]):number {return nodes.reduce((sum,n)=>sum+1+(n.type==='group'?countNodes(n.children):0),0);}

export default function ToolbarSettings({value,onSaved}:{value?:unknown;onSaved?:(config:ToolbarConfigV1)=>void}) {
  const [config,setConfig]=useState(()=>parseToolbarConfig(value));
  const [surface,setSurface]=useState<ToolbarSurface>('top');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [report,setReport]=useState<ImportReport|null>(null);
  const layout=config.layouts[surface];
  const setItems=(items:ToolbarNode[])=>setConfig(c=>({...c,layouts:{...c.layouts,[surface]:{...c.layouts[surface],items}}}));
  const save=async()=>{
    setBusy(true);setMessage('');
    try {
      const parsed=parseToolbarConfig(config);await api.putSettings({ui:{editingToolbar:parsed}});
      setConfig(parsed);window.dispatchEvent(new CustomEvent('editing-toolbar-config',{detail:parsed}));onSaved?.(parsed);setMessage('Editing toolbar saved.');
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to save toolbar settings.');}
    finally{setBusy(false);}
  };
  const importFile=async(file:File|undefined)=>{
    if(!file)return;
    try{if(file.size>1024*1024)throw Error('Toolbar configuration must be smaller than 1 MB.');const next=importEditingToolbar(JSON.parse(await file.text()));setConfig(next.config);setReport(next);setMessage('Imported for review. Save to apply.');}
    catch(error){setMessage(error instanceof Error?error.message:'Invalid toolbar JSON.');}
  };
  const exportFile=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(parseToolbarConfig(config),null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='webobsidian-editing-toolbar.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div className="toolbar-settings">
    <h2>Editing toolbar</h2>
    <p>Each toolbar has its own commands and groups. Changes apply when saved. Move items with the arrow buttons or Alt+↑ / Alt+↓.</p>
    <fieldset><legend>Visible toolbars</legend>{toolbarSurfaces.map(key=><label key={key} style={{display:'inline-flex',gap:5,marginRight:14}}><input type="checkbox" checked={config.layouts[key].enabled} onChange={e=>setConfig(c=>({...c,layouts:{...c.layouts,[key]:{...c.layouts[key],enabled:e.target.checked}}}))}/>{key}</label>)}</fieldset>
    <label style={{display:'block',margin:'12px 0'}}>Edit layout <select className="text-input" aria-label="Edit toolbar layout" value={surface} onChange={e=>setSurface(e.target.value as ToolbarSurface)}>{toolbarSurfaces.map(key=><option key={key}>{key}</option>)}</select></label>
    <NodeEditor items={layout.items} allItems={layout.items} setItems={setItems} commandOptions={[...toolbarCommandOptions,...config.customCommands]} depth={0}/>
    <button className="btn secondary" onClick={()=>setConfig(c=>({...c,layouts:{...c.layouts,[surface]:getDefaultToolbarConfig().layouts[surface]}}))}>Reset {surface} layout</button>
    <fieldset style={{marginTop:16}}><legend>Appearance</legend>
      <label>Icon size <input type="number" min={12} max={32} value={config.appearance.iconSize} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,iconSize:Number(e.target.value)}}))}/></label>{' '}
      <label>Density <select value={config.appearance.density} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,density:e.target.value as 'comfortable'|'compact'}}))}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>{' '}
      <label>Style <select value={config.appearance.style} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,style:e.target.value as 'standard'|'compact'}}))}><option value="standard">Standard</option><option value="compact">Compact</option></select></label>{' '}
      <label>Overflow <select value={config.appearance.overflow} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,overflow:e.target.value as 'scroll'|'wrap'}}))}><option value="scroll">Scroll</option><option value="wrap">Wrap</option></select></label>
      {(['showLabels','tooltips'] as const).map(key=><label key={key} style={{display:'block'}}><input type="checkbox" checked={config.appearance[key]} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,[key]:e.target.checked}}))}/>{key==='showLabels'?'Show labels':'Show tooltips'}</label>)}
      {(['backgroundColor','iconColor'] as const).map(key=><label key={key} style={{display:'block'}}>{key==='backgroundColor'?'Panel background':'Icon color'} <input className="text-input" aria-label={key==='backgroundColor'?'Panel background':'Icon color'} placeholder="Theme default or #RRGGBBAA" pattern="#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?" value={config.appearance[key]??''} onChange={e=>setConfig(c=>({...c,appearance:{...c.appearance,[key]:e.target.value||undefined}}))}/></label>)}
      <label style={{display:'block'}}>Custom palette colors <input className="text-input" placeholder="#ff0000, #00ff0080" value={config.customColors.join(', ')} onChange={e=>setConfig(c=>({...c,customColors:e.target.value.split(',').map(v=>v.trim())}))}/></label>
    </fieldset>
    <CustomCommands config={config} setConfig={setConfig}/>
    <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:16}}>
      <button className="btn" onClick={save} disabled={busy}>{busy?'Saving…':'Save toolbar settings'}</button>
      <button className="btn secondary" onClick={exportFile}>Export JSON</button>
      <label className="btn secondary">Import JSON<input aria-label="Import toolbar JSON" type="file" accept="application/json,.json" style={{display:'block',maxWidth:230}} onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label>
    </div>
    {message&&<p role="status">{message}</p>}
    {report&&<details open><summary>Import report: {report.importedItems} items, {report.unknownCommands.length} unavailable commands</summary>{report.warnings.length?<ul>{report.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>:<p>Imported successfully.</p>}</details>}
  </div>;
}
function NodeEditor({items,allItems,setItems,commandOptions,depth}:{items:ToolbarNode[];allItems:ToolbarNode[];setItems:(nodes:ToolbarNode[])=>void;commandOptions:{id:string;label:string}[];depth:number}) {
  const change=(id:string,update:(n:ToolbarNode)=>ToolbarNode|null)=>setItems(updateNode(allItems,id,update));
  const add=(type:'command'|'group'|'separator',parent?:string)=>{
    if(countNodes(allItems)>=200)return;
    const node:ToolbarNode=type==='command'?{type,instanceId:newId(),commandId:commandOptions[0].id}:type==='group'?{type,instanceId:newId(),label:'New group',children:[]}:{type,instanceId:newId()};
    setItems(parent?appendGroup(allItems,parent,node):[...allItems,node]);
  };
  return <div>{items.map((node,index)=><div key={node.instanceId} style={{border:'1px solid var(--bg-modifier-border)',borderRadius:4,padding:6,marginBottom:6}} onKeyDown={e=>{if(e.altKey&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();e.stopPropagation();setItems(moveToolbarItem(allItems,node.instanceId,e.key==='ArrowUp'?-1:1));}}}>
    <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
      <span>{node.type==='separator'?'Separator':node.type==='group'?'Group':'Command'}</span>
      {node.type==='command'&&<select aria-label={`Command ${index+1}`} className="text-input" value={node.commandId} style={{maxWidth:210}} onChange={e=>change(node.instanceId,n=>n.type==='command'?{type:'command',instanceId:n.instanceId,commandId:e.target.value,label:commandOptions.find(c=>c.id===e.target.value)?.label,icon:n.icon}:n)}>{!commandOptions.some(c=>c.id===node.commandId)&&<option value={node.commandId}>{node.commandId} (unavailable)</option>}{commandOptions.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>}
      {node.type!=='separator'&&<><input aria-label={`${node.type} label ${index+1}`} className="text-input" placeholder="Label" maxLength={120} style={{maxWidth:150}} value={node.label??''} onChange={e=>change(node.instanceId,n=>n.type!=='separator'?{...n,label:e.target.value}:n)}/><select aria-label={`Icon ${index+1}`} value={node.icon??'command'} onChange={e=>change(node.instanceId,n=>n.type!=='separator'?{...n,icon:e.target.value}:n)}>{toolbarIcons.map(icon=><option key={icon}>{icon}</option>)}</select></>}
      <button type="button" className="btn secondary" aria-label={`Move item ${index+1} up`} disabled={index===0} onClick={()=>setItems(moveToolbarItem(allItems,node.instanceId,-1))}>↑</button>
      <button type="button" className="btn secondary" aria-label={`Move item ${index+1} down`} disabled={index===items.length-1} onClick={()=>setItems(moveToolbarItem(allItems,node.instanceId,1))}>↓</button>
      <button type="button" className="btn secondary" aria-label={`Remove item ${index+1}`} onClick={()=>change(node.instanceId,()=>null)}>Remove</button>
    </div>
    {node.type==='command'&&node.disabled&&<p>{node.disabledReason}</p>}
    {node.type==='group'&&<div style={{marginLeft:14,marginTop:6}}>
      <label>Group presentation <select value={node.style??'menu'} onChange={e=>change(node.instanceId,n=>n.type==='group'?{...n,style:e.target.value as 'menu'|'compact'}:n)}><option value="menu">Menu</option><option value="compact">Compact panel</option></select></label>
      <NodeEditor items={node.children} allItems={allItems} setItems={setItems} commandOptions={commandOptions} depth={depth+1}/>
      <button className="btn secondary" onClick={()=>add('command',node.instanceId)}>Add command to {node.label}</button>{' '}
      <button className="btn secondary" onClick={()=>add('separator',node.instanceId)}>Add separator to {node.label}</button>{' '}
      {depth<2&&<button className="btn secondary" onClick={()=>add('group',node.instanceId)}>Add subgroup</button>}
    </div>}
  </div>)}{depth===0&&<div style={{display:'flex',gap:6,margin:'8px 0'}}><button className="btn secondary" onClick={()=>add('command')}>Add command</button><button className="btn secondary" onClick={()=>add('group')}>Add group</button><button className="btn secondary" onClick={()=>add('separator')}>Add separator</button></div>}</div>;
}
function CustomCommands({config,setConfig}:{config:ToolbarConfigV1;setConfig:Dispatch<SetStateAction<ToolbarConfigV1>>}) {
  const update=(index:number,key:'label'|'prefix'|'suffix'|'icon',value:string)=>setConfig(c=>({...c,customCommands:c.customCommands.map((item,i)=>i===index?{...item,[key]:value}:item)}));
  return <fieldset style={{marginTop:16}}><legend>Literal text templates</legend><p>Prefix and suffix are inserted as written around every selection. Variables and scripts are never evaluated.</p>
    {config.customCommands.map((command,index)=><div key={command.id} style={{marginBottom:12}}><code>{command.id}</code>{' '}<button className="btn secondary" onClick={()=>setConfig(c=>({...c,customCommands:c.customCommands.filter((_,i)=>i!==index)}))}>Remove template</button>
      <label style={{display:'block'}}>Label <input className="text-input" maxLength={120} value={command.label} onChange={e=>update(index,'label',e.target.value)}/></label>
      <label style={{display:'block'}}>Icon <select value={command.icon} onChange={e=>update(index,'icon',e.target.value)}>{toolbarIcons.map(icon=><option key={icon}>{icon}</option>)}</select></label>
      <label style={{display:'block'}}>Prefix <textarea className="text-input" maxLength={4096} value={command.prefix} onChange={e=>update(index,'prefix',e.target.value)}/></label>
      <label style={{display:'block'}}>Suffix <textarea className="text-input" maxLength={4096} value={command.suffix} onChange={e=>update(index,'suffix',e.target.value)}/></label>
    </div>)}<button className="btn secondary" disabled={config.customCommands.length>=100} onClick={()=>setConfig(c=>({...c,customCommands:[...c.customCommands,{id:`custom:${crypto.randomUUID()}`,label:'New template',icon:'command',prefix:'',suffix:''}]}))}>Add template</button>
  </fieldset>;
}
