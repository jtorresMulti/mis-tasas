/* ============================================================
   Robot de tasas — Mis Finanzas
   Arma rates.json con:
     • Referencia (IBC, Usura=1.5×IBC, Tasa de política BanRep, DTF)  → APIs oficiales
     • CDT por entidad (Formato 441 Superfinanciera)                  → API oficial
     • Ahorro y Créditos                                              → banks-seed.json (editable a mano)
   Nunca borra datos: si una fuente falla, conserva los valores previos de rates.json.
   Ejecuta con: node build-rates.mjs   (Node 18+). En GitHub Actions corre solo por cron.
   ============================================================ */
import { readFile, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (rates-bot; +https://github.com)';
const today = new Date().toISOString().slice(0, 10);
const FUENTES = ['Superfinanciera (datos.gov.co)', 'Banco de la República (SDMX)', 'banks-seed.json'];

function pctNum(x) { const n = parseFloat(String(x == null ? '' : x).replace('%', '').replace(',', '.')); return isFinite(n) ? Math.round(n * 100) / 100 : null; }

async function getJson(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json', 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
  return r.json();
}
async function getBanrep(flow) {
  const url = `https://totoro.banrep.gov.co/nsi-jax-ws/rest/data/ESTAT,${flow},1.0/all/ALL/?dimensionAtObservation=TIME_PERIOD`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/vnd.sdmx.genericdata+xml;version=2.1' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' banrep ' + flow);
  const xml = await r.text();
  let best = null;
  for (const block of xml.split('<generic:Obs>')) {
    const d = block.match(/<generic:ObsDimension value="([^"]+)"/);
    const v = block.match(/<generic:ObsValue value="([^"]+)"/);
    if (d && v) { const date = d[1]; const val = pctNum(v[1]); if (val != null && (!best || date > best.date)) best = { date, val }; }
  }
  if (!best) throw new Error('sin datos banrep ' + flow);
  return best.val;
}

async function buildReferencia() {
  const out = [];
  // IBC + Usura (consumo y ordinario)
  const ibcRows = await getJson('https://www.datos.gov.co/resource/pare-7x5i.json?modalidad=' + encodeURIComponent('CONSUMO Y ORDINARIO') + '&$order=vigencia_desde%20DESC&$limit=1');
  const ibc = pctNum(ibcRows[0] && ibcRows[0].interes_bancario_corriente);
  if (ibc != null) {
    out.push({ entidad: 'Usura · consumo y ordinario', producto: 'Tope legal (1,5 × IBC)', tipo: 'referencia', rate: Math.round(ibc * 1.5 * 100) / 100 });
    out.push({ entidad: 'Interés bancario corriente (IBC)', producto: 'Consumo y ordinario', tipo: 'referencia', rate: ibc });
  }
  // Tasa de política y DTF (Banco de la República)
  try { const tpm = await getBanrep('DF_CBR_DAILY_LATEST'); out.push({ entidad: 'Banco de la República', producto: 'Tasa de intervención (política)', tipo: 'referencia', rate: tpm }); } catch (e) { console.error('TPM:', e.message); }
  try { const dtf = await getBanrep('DF_DTF_DAILY_LATEST'); out.push({ entidad: 'DTF', producto: 'CDT 90 días (promedio sistema)', tipo: 'referencia', rate: dtf }); } catch (e) { console.error('DTF:', e.message); }
  if (!out.length) throw new Error('referencia vacía');
  return out;
}

async function buildCdt() {
  const base = 'https://www.datos.gov.co/resource/axk9-g2nh.json';
  const uca = encodeURIComponent('EMISIONES PUNTUALES Y RANGOS DE EMISION DE CDT');
  const maxRows = await getJson(base + '?$select=max(fechacorte)%20as%20m');
  const fecha = maxRows[0] && maxRows[0].m;
  if (!fecha) throw new Error('sin fechacorte CDT');
  const plazos = [['A 360 DIAS', 'CDT 360 días', 8], ['A 180 DIAS', 'CDT 180 días', 4]];
  const out = [];
  for (const [desc, prod, lim] of plazos) {
    const rows = await getJson(base + '?nombre_unidad_de_captura=' + uca + '&descripcion=' + encodeURIComponent(desc) + '&fechacorte=' + encodeURIComponent(fecha) + '&$select=nombreentidad,tasa&$order=tasa%20DESC&$limit=' + lim);
    rows.forEach(r => { const rate = pctNum(r.tasa); if (rate != null && rate > 0) out.push({ entidad: String(r.nombreentidad || '').trim(), producto: prod, tipo: 'cdt', rate }); });
  }
  if (!out.length) throw new Error('CDT vacío');
  return out;
}

async function main() {
  // previo (para prev + fallback si una fuente falla)
  let old = { version: 0, list: [] };
  try { old = JSON.parse(await readFile(new URL('./rates.json', import.meta.url), 'utf8')); } catch { /* primera vez */ }
  const oldByKey = {}; (old.list || []).forEach(x => { oldByKey[x.entidad + '|' + x.producto] = x.rate; });
  const oldByTipo = t => (old.list || []).filter(x => x.tipo === t).map(x => ({ entidad: x.entidad, producto: x.producto, tipo: x.tipo, rate: x.rate }));

  const seed = JSON.parse(await readFile(new URL('./banks-seed.json', import.meta.url), 'utf8'));
  const seedItems = t => (seed[t] || []).map(x => ({ entidad: x.entidad, producto: x.producto, tipo: t, rate: pctNum(x.rate) }));

  // cada sección: intenta la fuente; si falla, usa lo previo (nunca borra)
  const sect = async (name, fn, fallback) => { try { const v = await fn(); console.log('✓', name, v.length); return v; } catch (e) { console.error('✗', name, '→ uso previo:', e.message); return fallback(); } };

  const referencia = await sect('referencia', buildReferencia, () => oldByTipo('referencia'));
  const cdt = await sect('cdt', buildCdt, () => oldByTipo('cdt'));
  const ahorro = seedItems('ahorro');            // editable a mano en banks-seed.json
  const credito = seedItems('credito');           // editable a mano en banks-seed.json

  // ensamblar + calcular prev (lo que valía antes)
  const list = [...referencia, ...cdt, ...ahorro, ...credito]
    .filter(x => x.entidad && x.rate != null)
    .map(x => { const before = oldByKey[x.entidad + '|' + x.producto]; return before != null ? { ...x, prev: before } : { ...x }; });

  // ¿cambió algo? (firma entidad|producto|rate)
  const sig = l => l.map(x => x.entidad + '|' + x.producto + '|' + x.rate).sort().join(';');
  if (sig(list) === sig(old.list || [])) { console.log('Sin cambios; no se reescribe.'); return; }

  const outObj = { version: (Number(old.version) || 0) + 1, updated: today, fuentes: FUENTES, list };
  await writeFile(new URL('./rates.json', import.meta.url), JSON.stringify(outObj, null, 2) + '\n', 'utf8');
  console.log('rates.json escrito: v' + outObj.version + ' · ' + list.length + ' tasas · ' + today);
}

main().catch(e => { console.error('FALLO:', e); process.exit(1); });
