import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
let root:string;
let follow=false;
beforeEach(async()=>{root=await fs.mkdtemp(path.join(os.tmpdir(),'vault-preferences-'));follow=false;vi.resetModules();vi.doMock('./settings.js',()=>({getSettings:async()=>({vault:{path:root,attachmentDir:'attachments',deleteMode:'trash',followObsidianDeletion:follow}})}));});
afterEach(async()=>{vi.doUnmock('./settings.js');await fs.rm(root,{recursive:true,force:true});});
async function app(value:unknown){await fs.mkdir(path.join(root,'.obsidian'),{recursive:true});await fs.writeFile(path.join(root,'.obsidian','app.json'),typeof value==='string'?value:JSON.stringify(value));}
it('hides unsupported files by default while respecting an explicit Obsidian preference',async()=>{
 const {getVaultPreferences}=await import('./vaultPreferences.js');
 expect((await getVaultPreferences()).values.showUnsupportedFiles).toBe(false);
 await app({});expect((await getVaultPreferences()).values.showUnsupportedFiles).toBe(false);
 await app({showUnsupportedFiles:true});const enabled=await getVaultPreferences();
 expect(enabled.values.showUnsupportedFiles).toBe(true);expect(enabled.sources.showUnsupportedFiles).toBe('obsidian');
 await app({showUnsupportedFiles:false});expect((await getVaultPreferences()).values.showUnsupportedFiles).toBe(false);
});
it('reads portable rules freshly without changing Obsidian or importing permanent deletion',async()=>{
 await app({alwaysUpdateLinks:true,readableLineLength:false,trashOption:'none',attachmentFolderPath:'./images',unknown:123});
 const {getVaultPreferences}=await import('./vaultPreferences.js');const first=await getVaultPreferences();
 expect(first.values).toMatchObject({alwaysUpdateLinks:true,readableLineLength:false,attachmentFolderPath:'./images',deleteMode:'trash'});
 expect(first.sources.deleteMode).toBe('webobsidian');expect(first.sources.alwaysUpdateLinks).toBe('obsidian');
 await app({alwaysUpdateLinks:false});expect((await getVaultPreferences()).values.alwaysUpdateLinks).toBe(false);
});
it('reports malformed and invalid config while using safe typed fallbacks',async()=>{
 const {getVaultPreferences}=await import('./vaultPreferences.js');await app('{broken');expect((await getVaultPreferences()).warnings.join(' ')).toMatch(/app.json/);
 await app({alwaysUpdateLinks:'yes',newLinkFormat:'invalid',userIgnoreFilters:['ok',3]});const r=await getVaultPreferences();
 expect(r.values.alwaysUpdateLinks).toBe(false);expect(r.sources.alwaysUpdateLinks).toBe('default');expect(r.values.userIgnoreFilters).toEqual([]);expect(r.warnings.length).toBeGreaterThan(0);
});
it('uses trash with a visible warning for unavailable system trash when explicitly following Obsidian',async()=>{
 follow=true;
 await app({trashOption:'system'});const r=await(await import('./vaultPreferences.js')).getVaultPreferences();
 expect(r.values.deleteMode).toBe('trash');expect(r.warnings.join(' ')).toMatch(/system.*trash/i);
});
it('shares the uploader missing-file and omitted-key attachment rules',async()=>{
 const {getVaultPreferences,getAttachmentFolderSetting}=await import('./vaultPreferences.js');
 expect((await getVaultPreferences()).values.attachmentFolderPath).toBe('./attachments');
 expect(await getAttachmentFolderSetting()).toBe('./attachments');
 await app({unrelated:'preserved'});
 const preferences=await getVaultPreferences();expect(preferences.values.attachmentFolderPath).toBe('/');expect(preferences.sources.attachmentFolderPath).toBe('default');
 expect(await getAttachmentFolderSetting()).toBe('/');
});
it('reports blocked uploads instead of claiming a fallback rule for malformed attachment configuration',async()=>{
 const {getVaultPreferences,getAttachmentFolderSetting}=await import('./vaultPreferences.js');
 for(const value of ['{broken',{attachmentFolderPath:17}]){
  await app(value);expect((await getVaultPreferences()).blocked?.attachmentUpload).toMatch(/app.json|attachmentFolderPath/);
  await expect(getAttachmentFolderSetting()).rejects.toThrow(/app.json|attachmentFolderPath/);
 }
});
