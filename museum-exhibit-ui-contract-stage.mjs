// MIO museum UNROUTED, pure owner-form -> draft-store contract.
// No browser, HTTP, env, database or media access. This is only a
// reviewed bridge for a future authenticated server-side save handler.
// Draft fields are validated again by museum-exhibit-private-draft-stage.
const FIELDS='category,credit,description,externalUrl,occurredOn,room,title';
const ROOMS=new Set(['gallery','icons','moments','events']);
const CATEGORIES=new Set(['イラスト','動画','音声・楽曲','ファンアート','その他']);
const fail=()=>{throw Error('MUSEUM_EXHIBIT_FORM_FIELDS_INVALID')};
export function prepareMuseumExhibitFormDraftStage(form){
 if(!form||typeof form!=='object'||Array.isArray(form)||
   Object.keys(form).sort().join(',')!==FIELDS)fail();
 if(!ROOMS.has(form.room)||!CATEGORIES.has(form.category)||
   typeof form.title!=='string'||typeof form.description!=='string'||
   typeof form.credit!=='string'||typeof form.externalUrl!=='string'||
   !(form.occurredOn===null||typeof form.occurredOn==='string'))fail();
 // The owner form has no upload: never accept client-chosen image URLs,
 // publication status, actor or review timestamps in this path.
 return Object.freeze({
  kind:form.room,category:form.category,
  title:form.title,description:form.description,credit:form.credit,
  occurredOn:form.occurredOn,imageUrl:'',externalUrl:form.externalUrl
 });
}
