// vNext: the public form only appears if the server says intake is ready.
const section=document.getElementById('apply');
const button=(label)=>{const b=document.createElement('button');b.type='submit';b.className='btn primary';b.textContent=label;return b;};
const field=(form,{name,label,type='text',max=120,required=false,multiline=false})=>{
 const wrap=document.createElement('label');wrap.style.display='grid';wrap.style.gap='6px';
 wrap.style.margin='13px 0';wrap.textContent=label;
 const input=multiline?document.createElement('textarea'):document.createElement('input');
 if(!multiline)input.type=type;
 input.name=name;input.maxLength=max;input.required=required;
 input.style.width='100%';input.style.minHeight='45px';input.style.padding='10px';
 input.style.border='1px solid #9edbff';input.style.borderRadius='10px';
 input.style.background='#061d3d';input.style.color='#fff';
 wrap.append(input);form.append(wrap);return input;
};
function formUi(){
 section.replaceChildren();
 const heading=document.createElement('h2');heading.id='applyTitle';heading.textContent='💌 翠央っ子ギャラリー作品応募';
 const intro=document.createElement('p');intro.textContent='作品の公開URLを送ってください。応募後は管理者が掲載許可と内容を確認します。自動公開はされません。';
 const form=document.createElement('form');form.noValidate=false;
 const title=field(form,{name:'title',label:'作品タイトル',max:120,required:true});
 const creator=field(form,{name:'creator',label:'掲載するお名前',max:80,required:true});
 const catWrap=document.createElement('label');catWrap.textContent='作品の種類';catWrap.style.display='grid';catWrap.style.margin='13px 0';
 const category=document.createElement('select');category.name='category';category.required=true;
 for(const value of ['ファンアート','イラスト','動画','音声・楽曲','その他']){
  const option=document.createElement('option');option.value=value;option.textContent=value;category.append(option);
 }
 category.style.minHeight='45px';category.style.background='#061d3d';category.style.color='#fff';catWrap.append(category);form.append(catWrap);
 const url=field(form,{name:'url',label:'作品の公開リンク（https://）',type:'url',max:2048,required:true});
 url.placeholder='https://...';
 const description=field(form,{name:'description',label:'作品の説明（任意）',max:1000,multiline:true});
 description.rows=3;
 // Honeypot is only for automated clients; never a legitimate user input.
 const honeypot=document.createElement('input');honeypot.name='website';honeypot.type='text';honeypot.tabIndex=-1;
 honeypot.autocomplete='off';honeypot.setAttribute('aria-hidden','true');honeypot.style.display='none';form.append(honeypot);
 const consentLabel=document.createElement('label');consentLabel.style.display='block';consentLabel.style.margin='16px 0';
 const consent=document.createElement('input');consent.type='checkbox';consent.required=true;
 consentLabel.append(consent,document.createTextNode(' 私は作品の掲載許可を得ており、タイトル・作品URL・掲載名が一般公開されることに同意します。'));form.append(consentLabel);
 const privacy=document.createElement('p');privacy.className='note';
 privacy.textContent='画像や音声ファイルは送信しません。不正な連続応募を防ぐため、接続情報から作成した識別値を応募管理データに保存します。接続元IPそのものは保存しません。応募内容は運営確認後にのみ公開されます。';
 const send=button('作品を応募する');form.append(send);
 const message=document.createElement('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 section.append(heading,intro,form,privacy,message);
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!form.reportValidity())return;
  send.disabled=true;message.textContent='応募内容を送信しています…';
  try{
   const work={action:'apply',title:title.value,creator:creator.value,
    category:category.value,url:url.value,description:description.value,
    consent:consent.checked,website:honeypot.value};
   const response=await fetch('/api/gallery/submissions',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(work)});
   const data=await response.json();
   if(!response.ok||data.ok!==true)throw Error(data.code||'UNAVAILABLE');
   form.reset();message.textContent='✅ 応募を受け付けました！ 運営確認後に掲載を判断します。';
  }catch(e){
   const reasons={
    SUBMISSION_ALREADY_RECEIVED:'この作品URLはすでに応募済みです。',
    ALREADY_PUBLISHED:'この作品はすでに掲載済みです。',
    SUBMISSION_RATE_LIMIT:'短時間の応募上限に達しました。時間をおいてください。',
    SUBMISSION_INVALID:'入力内容または掲載許可を確認してください。',
    SUBMISSION_INTAKE_CLOSED:'現在、応募受付を停止しています。'
   };
   message.textContent='⚠️ '+(reasons[e.message]||'受付を完了できませんでした。入力内容を保管して再度ご確認ください。');
  }finally{send.disabled=false;}
 });
}
(async()=>{
 if(!section)return;
 try{
  const r=await fetch('/api/gallery/submissions',{cache:'no-store',credentials:'omit'});
  if(!r.ok)return;
  const d=await r.json();
  if(d.ok===true&&d.open===true){
   const link=document.querySelector('.hero-actions a[href="#apply"]');
   if(link)link.textContent='作品を応募する 💌';
   formUi();
  }
 }catch{ /* Safely keep intake closed. */ }
})();
