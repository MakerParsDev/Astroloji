import fs from 'node:fs';
import { SignJWT, importPKCS8 } from 'jose';

const serviceAccountPathArg = process.argv.find((arg) => arg.startsWith('--service-account='));
const serviceAccountPath =
  serviceAccountPathArg?.split('=')[1] ||
  process.env.PLAY_SERVICE_ACCOUNT_JSON_PATH ||
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH;
const packageName = 'com.parsfilo.astrology';
const sourceLocale = 'tr-TR';
const localesArg = process.argv.find((arg) => arg.startsWith('--locales='));
const delayArg = process.argv.find((arg) => arg.startsWith('--delay-ms='));
const dryRun = process.argv.includes('--dry-run');
const delayMs = delayArg ? Number(delayArg.split('=')[1]) : 3000;
const locales = localesArg ? localesArg.split('=')[1].split(',').map(s => s.trim()).filter(Boolean) : [];
if (!locales.length) { console.error('Provide --locales=...'); process.exit(1); }
if (!serviceAccountPath) {
  console.error('Provide --service-account=... or set PLAY_SERVICE_ACCOUNT_JSON_PATH.');
  process.exit(1);
}
const localeTargetMap = {
  'fa':'fa','fa-AE':'fa','fa-AF':'fa','fa-IR':'fa','gu':'gu','kn-IN':'kn','kk':'kk','ky-KG':'ky','lo-LA':'lo','ms':'ms','ms-MY':'ms','mn-MN':'mn','ne-NP':'ne','pa':'pa','rm':'rm','si-LK':'si','sr':'sr','sl':'sl','sw':'sw','ta-IN':'ta','te-IN':'te','ur':'ur','iw-IL':'he','km-KH':'km'
};
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function truncateAtWord(text,max){ if(text.length<=max) return text; const s=text.slice(0,max-1); const i=s.lastIndexOf(' '); return (i>10?s.slice(0,i):s).trim(); }
async function getAccessToken(){ const sa=JSON.parse(fs.readFileSync(serviceAccountPath,'utf8')); const now=Math.floor(Date.now()/1000); const pk=await importPKCS8(sa.private_key,'RS256'); const jwt=await new SignJWT({iss:sa.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}).setProtectedHeader({alg:'RS256',typ:'JWT'}).sign(pk); const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}); const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body}); if(!res.ok) throw new Error(await res.text()); return (await res.json()).access_token; }
async function playRequest(token,path,options={}){ const res=await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}}); const text=await res.text(); if(!res.ok) throw new Error(`Play API ${res.status} ${path}: ${text}`); return text?JSON.parse(text):{}; }
async function translateText(text, locale){ const target = localeTargetMap[locale] || locale.split('-')[0]; let last; for (let attempt=1; attempt<=5; attempt++){ const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=tr|${encodeURIComponent(target)}&de=makerpars@gmail.com`; const res = await fetch(url); if (res.ok){ const json = await res.json(); const out = (json.responseData?.translatedText || text).trim(); await sleep(delayMs); return out; } last = `Translate error ${res.status} for ${locale}`; await sleep(delayMs * attempt); } throw new Error(last || `Translate error for ${locale}`); }
async function buildListing(src, locale){ const titleCandidates=[src.title,'Günlük Burç Yorumu','Burç Yorumu','Astroloji']; let title='Astroloji'; for (const c of titleCandidates){ const t = await translateText(c,locale); if(t.length<=30){ title=t; break; } }
 const shortCandidates=[src.shortDescription,'Günlük burç yorumu, aşk uyumu ve tahminler.','Burç yorumu ve aşk uyumu tek uygulamada.']; let short=''; for (const c of shortCandidates){ const t=await translateText(c,locale); if(t.length<=80){ short=t; break; } }
 if(!short) short = truncateAtWord(await translateText(src.shortDescription, locale),80);
 let full = await translateText(src.fullDescription, locale); if(full.length>4000) full = truncateAtWord(full, 3999);
 return {language:locale,title,shortDescription:short,fullDescription:full}; }
async function main(){ const token = await getAccessToken(); const edit = await playRequest(token,'/edits',{method:'POST'}); const src = await playRequest(token,`/edits/${edit.id}/listings/${sourceLocale}`); for (const locale of locales){ try { const listing = await buildListing(src, locale); console.log(`Prepared ${locale}: ${listing.title}`); if(!dryRun){ await playRequest(token,`/edits/${edit.id}/listings/${locale}`,{method:'PUT',body:JSON.stringify(listing)}); console.log(`Saved ${locale}`); } } catch(e){ console.error(`Failed ${locale}: ${e.message}`); } }
 if(!dryRun){ const committed = await playRequest(token,`/edits/${edit.id}:commit`,{method:'POST'}); console.log('Commit complete:', JSON.stringify(committed)); } }
main().catch(e=>{ console.error(e); process.exit(1); });
