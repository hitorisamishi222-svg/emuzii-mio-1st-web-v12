// Gallery moderation for repository writers, triggered only by GitHub workflow_dispatch.
// The workflow's GITHUB_TOKEN is provided by GitHub Actions; none is exposed to visitors.
import {readFile,writeFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(fileURLToPath(new URL('../',import.meta.url)));
const file=join(root,'gallery-items.js');
const {approvedGalleryItems}=await import(new URL('../gallery-items.js',import.meta.url));
const op=process.env.GALLERY_ACTION;
const id=process.env.GALLERY_ITEM_ID;
if(!['hide','restore','edit','clear_description','clear_thumbnail'].includes(op))throw Error('Unrecognized action');
if(!/^[a-z0-9-]{3,70}$/.test(id||''))throw Error('Invalid item identifier');
const items=approvedGalleryItems.map(x=>({...x}));
if(items.some(x=>!x.id||typeof x.id!=='string'))throw Error('Every gallery item must have a stable id');
if(new Set(items.map(x=>x.id)).size!==items.length)throw Error('Duplicate item IDs');
const item=items.find(x=>x.id===id);
if(!item)throw Error('Published item does not exist');
const safe=(s,max,label)=>{if(typeof s!=='string'||s.length>max)throw Error('Invalid '+label);return s.trim()};
const link=s=>{
 if(/^\/[A-Za-z0-9_./-]+$/.test(s)&&!s.includes('..')&&!s.startsWith('//'))return s;
 const u=new URL(s);
 if(u.protocol!=='https:'||u.username||u.password)throw Error('Only https links are allowed');
 return u.href;
};
if(op==='hide')item.hidden=true;
if(op==='restore')item.hidden=false;
if(op==='clear_description')item.description='';
if(op==='clear_thumbnail')item.thumbnail='';
if(op==='edit'){
 const fields=[['GALLERY_TITLE','title',120],['GALLERY_CREATOR','creator',80],['GALLERY_DESCRIPTION','description',1000],['GALLERY_URL','url',2048],['GALLERY_THUMBNAIL','thumbnail',300]];
 if(!fields.some(([key])=>(process.env[key]||'').trim())&&(process.env.GALLERY_CATEGORY||'変更しない')==='変更しない')throw Error('At least one value must change');
 for(const [env,key,max] of fields){
  const value=process.env[env]||'';
  if(!value.trim())continue;
  const next=safe(value,max,key);
  if(key==='url')item.url=link(next);
  else if(key==='thumbnail'){
    if(!/^\/assets\/[A-Za-z0-9_/-]+\.(png|jpg|jpeg|webp|gif|svg)$/i.test(next)||next.includes('..'))throw Error('Thumbnail must exist under /assets/');
    await access(join(root,next.slice(1)));
    item.thumbnail=next;
  }else{item[key]=next;}
 }
 const category=process.env.GALLERY_CATEGORY||'変更しない';
 if(category!=='変更しない'){
  if(!['動画','イラスト','音声・楽曲','ファンアート','その他'].includes(category))throw Error('Unrecognized category');
  item.category=category;
 }
}
if(!item.title.trim()||!item.url)throw Error('Title and link are mandatory');
await writeFile(file, `/**
 * 翠央っ子ギャラリー・公開済み作品リスト
 * GitHubの「掲載済み作品の管理」ワークフローで修正・一時非公開・再公開が可能。
 * 作品の承認・権利確認は管理者が実施。非公開はファイルの物理削除ではない。
 */
export const approvedGalleryItems = ${JSON.stringify(items,null,2)};
`,'utf8');
console.log('Gallery moderation:',op,id,'actor:',process.env.GITHUB_ACTOR||'unknown');
