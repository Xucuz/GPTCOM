const windows = new Map();
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {res.setHeader('Allow','POST');return res.status(405).json({error:'Yalnızca POST isteği kabul edilir.'});}
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({error:'Gemini bağlantısı hazırlanıyor. Lütfen daha sonra tekrar dene.'});
  const origin=req.headers.origin;
  if(origin){try{if(new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Bu kaynaktan istek kabul edilmiyor.'});}catch{return res.status(403).json({error:'Geçersiz kaynak.'});}}
  let body=req.body;
  try {if(typeof body==='string')body=JSON.parse(body);} catch{return res.status(400).json({error:'Geçersiz mesaj.'});}
  const messages=body?.messages;
  if(!Array.isArray(messages)||messages.length<1||messages.length>20||messages.some((m,i)=>!m||m.role!==(i%2===0?'user':'assistant')||typeof m.content!=='string'||!m.content.trim()||m.content.length>8000)||messages.at(-1).role!=='user'||JSON.stringify(messages).length>40000)return res.status(400).json({error:'Mesaj biçimi veya uzunluğu uygun değil. Yeni sohbet başlatıp tekrar dene.'});
  // Best-effort per-instance limit; provider quotas remain the account-wide limit.
  const now=Date.now(),ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0];
  for(const [key,value] of windows)if(now-value.start>60000)windows.delete(key);
  let slot=windows.get(ip);if(!slot){slot={start:now,count:0};windows.set(ip,slot);}
  if(++slot.count>10){res.setHeader('Retry-After','60');return res.status(429).json({error:'Çok hızlı mesaj gönderiyorsun. Bir dakika sonra tekrar dene.'});}
  const model=process.env.GEMINI_MODEL||'gemini-3.5-flash-lite';
  if(!/^[a-zA-Z0-9._-]+$/.test(model))return res.status(503).json({error:'Model ayarı geçersiz.'});
  try{
    const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{
      method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':process.env.GEMINI_API_KEY},signal:AbortSignal.timeout(45000),
      body:JSON.stringify({systemInstruction:{parts:[{text:'Sen GPTCOM adlı yardımcı bir yapay zekâ asistanısın. Kullanıcının dilinde açık ve yararlı yanıt ver. İnternette arama veya bilgisayarda işlem yaptığını iddia etme; bu araçlara erişimin yok.'}]},contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:2048}})
    });
    if(!response.ok){const code=response.status;return res.status(code===429?429:502).json({error:code===429?'Gemini kullanım sınırına ulaşıldı. Daha sonra tekrar dene.':code===401||code===403?'Gemini API anahtarı veya erişim izinleri kontrol edilmeli.':code===404?'Gemini model ayarı kontrol edilmeli.':'Gemini şu anda yanıt veremiyor. Daha sonra tekrar dene.'});}
    const data=await response.json(),reply=data.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('').trim();
    if(!reply)return res.status(422).json({error:'Bu mesaja yanıt üretilemedi. Sorunu farklı şekilde yazmayı dene.'});
    return res.status(200).json({reply});
  }catch{return res.status(504).json({error:'Bağlantı zaman aşımına uğradı. Lütfen tekrar dene.'});}
};
