import {api} from './api';
import {useStore} from './store';
import {findNode} from './tree';
import {pathToUrl} from './urlsync';
import type {PdfMenuItem} from './pdfMenu';

function renamePdf(path:string):Promise<void>{
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='pdf-rename-dialog';dialog.setAttribute('aria-label','Переименовать PDF');
  const form=document.createElement('form'),label=document.createElement('label'),input=document.createElement('input'),ok=document.createElement('button'),cancel=document.createElement('button'),error=document.createElement('div');
  label.textContent='Новое имя';input.value=path.split('/').pop()!.replace(/\.pdf$/i,'');input.required=true;label.append(input);
  ok.type='submit';ok.textContent='Переименовать';cancel.type='button';cancel.textContent='Отмена';error.setAttribute('role','alert');form.append(label,error,ok,cancel);dialog.append(form);
  let pending=false;
  const done=()=>{dialog.remove();resolve()};cancel.onclick=()=>{if(!pending)done()};dialog.oncancel=e=>{e.preventDefault();if(!pending)done()};
  form.onsubmit=async e=>{
   e.preventDefault();if(pending)return;const value=input.value.trim();
   if(!value||/[\\/\u0000-\u001f]/.test(value)||value==='.'||value==='..'){error.textContent='Введите имя файла без пути';return}
   const name=/\.pdf$/i.test(value)?value:value+'.pdf',dir=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'';
   if(dir+name===path){done();return}
   pending=true;ok.disabled=true;cancel.disabled=true;
   try{await useStore.getState().renamePath(path,dir+name);done()}catch(reason){error.textContent=reason instanceof Error?reason.message:'Не удалось переименовать';pending=false;ok.disabled=false;cancel.disabled=false}
  };
  (document.querySelector('.app')??document.body).append(dialog);dialog.showModal();input.focus();input.select();
 });
}

/** Only the authenticated app supplies vault actions; public readers import none. */
export function pdfFileActions(target:string,origin:string,options:{resolvedPath?:string;linkKind?:'wiki'|'markdown';fragment?:string}={}):()=>Promise<PdfMenuItem[]>{
 return async()=>{
  const path=options.resolvedPath??(options.linkKind==='markdown'?await api.resolve(target,origin,'markdown'):await api.resolveAttachment(target.split('#')[0],origin)).path;if(!path)throw Error('PDF не найден');
  const st=useStore.getState(),locked=!!findNode(st.tree,path)?.locked;
  const fragment=options.fragment??(options.resolvedPath?'':target.includes('#')?target.slice(target.indexOf('#')+1):'');
  const url=pathToUrl(path)+(fragment?'#'+fragment:'');
  return [
   {label:'Открыть в новой вкладке',icon:'tab',run:()=>useStore.getState().openFile(path,{preview:false,...(fragment?{pdfFragment:fragment}:{})})},
   {label:'Открыть в области справа',icon:'split',run:()=>useStore.getState().openToSide(path,'right',fragment?{pdfFragment:fragment}:undefined)},
   {label:'Открыть в новом окне',icon:'window',run:()=>{window.open(url,'_blank','popup,noopener,noreferrer')}},
   {label:'Переименовать',icon:'rename',disabled:locked,run:()=>renamePdf(path)},
   {label:'Переместить файл в...',icon:'folder',disabled:locked,run:()=>useStore.getState().setMovePath(path)},
   {label:st.bookmarks.includes(path)?'Удалить из закладок':'Добавить в закладки...',icon:'bookmark',run:()=>useStore.getState().toggleBookmark(path)},
   {label:'Копировать путь',icon:'link',children:[
    {label:'Путь от корня хранилища',run:()=>navigator.clipboard.writeText(path)},
    {label:'Ссылка в браузере',run:()=>navigator.clipboard.writeText(new URL(url,location.origin).href)},
   ]},
   {label:'Открыть в приложении по умолчанию',icon:'window',disabled:true,hint:'Команда операционной системы недоступна из браузера'},
   {label:'Показать в Проводнике',icon:'folder',disabled:true,hint:'Проводник на вашем компьютере недоступен для серверного файла'},
   {label:'Показать в файловом менеджере',icon:'folder',run:()=>useStore.getState().revealInTree(path)},
  ];
 };
}
