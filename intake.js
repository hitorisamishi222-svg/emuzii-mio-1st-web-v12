const $ = id => document.getElementById(id);
const keyName = 'mio-intake-request-key-v1';
let savedReceipt = '';
const setMessage = (text, error = false) => {
  $('message').textContent = text;
  $('message').classList.toggle('error', error);
};
const bytesToHex = bytes => Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');

function getRequestKey() {
  let key = sessionStorage.getItem(keyName);
  if (!/^[a-f0-9]{32}$/.test(key || '')) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    key = bytesToHex(bytes);
    sessionStorage.setItem(keyName, key);
  }
  return key;
}

function displayReceipt(receipt) {
  savedReceipt = receipt;
  $('receipt').textContent = receipt;
  $('intakeForm').hidden = true;
  $('ticket').hidden = false;
  $('availability').textContent = '仮受付のみ完了しています（利用権限はありません）';
}

async function checkAvailability() {
  try {
    const response = await fetch('/api/intake', {method:'GET', cache:'no-store'});
    const result = await response.json();
    if (response.ok && result.available === true) {
      $('availability').textContent = '仮受付の申請を受け付けています';
      $('intakeForm').hidden = false;
    } else {
      $('availability').textContent = '安全な仮受付の準備中です。受付開始後にご利用ください。';
    }
  } catch {
    $('availability').textContent = '現在は受付状況を確認できません。運営へお問い合わせください。';
  }
}

$('intakeForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('send');
  if (button.disabled) return;
  const nickname = $('nickname').value.trim();
  const kind = $('kind').value;
  if (!nickname || !$('consent').checked) return;
  button.disabled = true;
  setMessage('申請を送信しています…');
  try {
    const response = await fetch('/api/intake', {
      method:'POST',
      credentials:'same-origin',
      cache:'no-store',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({
        nickname, kind, consent:true,
        requestKey:getRequestKey(),
        website:$('website').value
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.ok !== true || !/^MIO-T-[A-F0-9]{20}$/.test(result.receipt || '')) {
      if (response.status === 503) $('intakeForm').hidden = true;
      throw new Error(result.error || '受付結果を確認できませんでした。運営へお問い合わせください');
    }
    displayReceipt(result.receipt);
    setMessage('仮受付が完了しました。表示された番号を控えてください。');
  } catch (error) {
    setMessage(error?.message || '送信できませんでした。運営へお問い合わせください', true);
  } finally {
    button.disabled = false;
  }
});

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(savedReceipt);
    setMessage('仮受付番号をコピーしました。');
  } catch {
    setMessage('上の仮受付番号を長押ししてコピーしてください。');
  }
});

void checkAvailability();
