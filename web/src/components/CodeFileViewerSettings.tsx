import {useState} from 'react';
import {defaultCodeFileViewer,parseCodeMappings,type CodeFileViewerSettings as Settings} from '../lib/codeFiles';
export default function CodeFileViewerSettings({value,onSave}:{value:Settings;onSave:(next:Settings)=>Promise<void>}){
 const [enabled,setEnabled]=useState(value.enabled);const [numbers,setNumbers]=useState(value.lineNumbers);const [text,setText]=useState(format(value.extensionMap));const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 const save=async()=>{const r=parseCodeMappings(text);if(r.errors.length){setMessage(r.errors.join('\n'));return;}setBusy(true);try{await onSave({enabled,lineNumbers:numbers,extensionMap:r.map});setMessage('Saved');}catch(e){setMessage(e instanceof Error?e.message:'Could not save settings');}finally{setBusy(false);}};
 return <div><h2>Code files</h2><p>Open mapped file types in a read-only code viewer. Disable this viewer to use the existing editor for previously supported text formats.</p>
 <p><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Enable code viewer</label></p>
 <p><label><input type="checkbox" checked={numbers} onChange={e=>setNumbers(e.target.checked)}/> Show line numbers</label></p>
 <label>Extension → language mappings<textarea aria-label="Extension to language mappings" rows={16} value={text} onChange={e=>setText(e.target.value)} style={{width:'100%'}}/></label>
 <p>One mapping per line, e.g. py: python. Use plain for unhighlighted text. Lines starting with # are comments.</p>
 <button disabled={busy} onClick={()=>{setText(format(defaultCodeFileViewer.extensionMap));setEnabled(true);setNumbers(true);}}>Restore defaults</button> <button disabled={busy} onClick={()=>void save()}>Save</button><p role="status" style={{whiteSpace:'pre-line'}}>{message}</p></div>;
}
function format(map:Record<string,string>){return Object.keys(map).sort().map(ext=>`${ext}: ${map[ext]}`).join('\n');}
