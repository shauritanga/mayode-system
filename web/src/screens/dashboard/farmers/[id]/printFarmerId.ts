/* Prints a farmer's membership identity card, modelled on the green paper card AMCOS members already carry:
   photo and society name on top, then the member's details on dotted lines, and the reminder to pay contributions on time. */

export interface FarmerIdCardData {
  name: string;
  farmerId: string;
  photoUrl: string | null;
  initials: string;
  amcosName: string;
  amcosAddress: string;
  amcosCode: string;
  /** Farm id(s) of the hectares the farmer holds, e.g. "5.15R-12". Doubles as the membership number. */
  shamba: string;
  village: string;
  ward: string;
  issuedOn: string;
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

// Code 128 bar patterns (1 = bar, 0 = space) for symbol values 0-106; 104 starts code set B, 106 is the stop pattern.
const CODE128 = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', '10001001100',
  '10011001000', '10011000100', '10001100100', '11001001000', '11001000100', '11000100100',
  '10110011100', '10011011100', '10011001110', '10111001100', '10011101100', '10011100110',
  '11001110010', '11001011100', '11001001110', '11011100100', '11001110100', '11101101110',
  '11101001100', '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', '10001000110',
  '10110001000', '10001101000', '10001100010', '11010001000', '11000101000', '11000100010',
  '10110111000', '10110001110', '10001101110', '10111011000', '10111000110', '10001110110',
  '11101110110', '11010001110', '11000101110', '11011101000', '11011100010', '11011101110',
  '11101011000', '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', '10010110000',
  '10010000110', '10000101100', '10000100110', '10110010000', '10110000100', '10011010000',
  '10011000010', '10000110100', '10000110010', '11000010010', '11001010000', '11110111010',
  '11000010100', '10001111010', '10100111100', '10010111100', '10010011110', '10111100100',
  '10011110100', '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', '10111101000',
  '10111100010', '11110101000', '11110100010', '10111011110', '10111101110', '11101011110',
  '11110101110', '11010000100', '11010010000', '11010011100', '1100011101011',
];

/** Code 128-B barcode of the text as an inline SVG that stretches to its box. Characters outside printable ASCII become "-". */
function code128Svg(text: string): string {
  const values = Array.from(text).map((ch) => { const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? c - 32 : 13; });
  const sum = values.reduce((total, v, i) => total + v * (i + 1), 104);
  const bits = [104, ...values, sum % 103, 106].map((v) => CODE128[v]).join('');
  let bars = '';
  for (let i = 0; i < bits.length; ) {
    if (bits[i] !== '1') { i += 1; continue; }
    let j = i;
    while (bits[j] === '1') j += 1;
    bars += `<rect x="${i}" y="0" width="${j - i}" height="1"/>`;
    i = j;
  }
  return `<svg viewBox="0 0 ${bits.length} 1" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#0b1f14">${bars}</svg>`;
}

/** Up to two letters for the logo tile, from the first word of the society's name ("Kasenga AMCOS" -> "KA"). */
const orgInitials = (name: string) => (name.trim().split(/\s+/)[0] ?? '').replace(/[^\p{L}]/gu, '').slice(0, 2).toUpperCase() || 'AM';

const cardHtml = (c: FarmerIdCardData) => {
  const field = (label: string, value: string, cls = '') =>
    `<div class="field"><div class="lbl">${esc(label)}</div><div class="val ${cls}">${esc(value || '')}</div></div>`;
  const photo = c.photoUrl
    ? `<img src="${esc(c.photoUrl)}" alt="" />`
    : `<div class="ph">${esc(c.initials)}</div>`;
  const shamba = c.shamba || c.farmerId;
  const barcodeOf = (shamba.split(',')[0] ?? '').trim() || c.farmerId;
  const society = c.amcosName.toUpperCase();
  return `<!doctype html><html><head><meta charset="utf-8"><title>Member ID - ${esc(c.name)}</title><style>
  @page { size: 105mm 74mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #e8e8e8; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { display: grid; place-items: center; min-height: 100vh; font-family: 'Helvetica Neue', Arial, sans-serif; color: #0b1f14; }
  .card { position: relative; width: 105mm; height: 74mm; overflow: hidden; background: #fff; border: .3mm solid #cfe3d6; border-radius: 3.5mm; }
  .bar1 { position: absolute; left: 0; top: 0; bottom: 0; width: 4mm; background: #0b3d22; }
  .bar2 { position: absolute; left: 4mm; top: 0; bottom: 0; width: 1.8mm; background: #d9f2e3; }
  .org { position: absolute; left: 9mm; top: 6mm; width: 26mm; display: flex; gap: 2mm; align-items: center; }
  .chip { flex: none; width: 8mm; height: 8mm; border-radius: 2mm; background: #1f9d57; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 3.4mm; letter-spacing: .1mm; }
  .org .nm { font-size: 2.3mm; font-weight: 800; line-height: 1.2; color: #0b3d22; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
  .photo { position: absolute; left: 9mm; top: 17.5mm; width: 26mm; height: 32mm; border-radius: 2.2mm; overflow: hidden; background: #e6efe9; border: .3mm solid #cfe3d6; }
  .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .ph { width: 100%; height: 100%; display: grid; place-items: center; background: linear-gradient(160deg, #3fc47c, #1f9d57); color: #fff; font-size: 9mm; font-weight: 800; }
  .code { position: absolute; left: 9mm; top: 51.5mm; width: 26mm; text-align: center; }
  .code svg { display: block; width: 100%; height: 7mm; }
  .code span { display: block; margin-top: .6mm; font-size: 2mm; letter-spacing: .3mm; color: #3d5246; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .head { position: absolute; left: 38mm; right: 0; top: 0; height: 15mm; padding: 3.6mm 4mm 0 5mm; color: #fff; background: linear-gradient(110deg, #279a58, #3fc47c); border-bottom: .8mm solid #f2b705; }
  .head .t { font-size: 3.2mm; font-weight: 800; letter-spacing: .1mm; white-space: nowrap; }
  .head .s { margin-top: 1.6mm; font-size: 2.3mm; opacity: .95; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grid { position: absolute; left: 38mm; right: 4mm; top: 19.5mm; display: grid; grid-template-columns: 1.55fr 1fr; gap: 4.5mm 3mm; }
  .field { border-left: .5mm solid #bfdcca; padding: .4mm 0 .4mm 2.6mm; min-width: 0; min-height: 11mm; }
  .lbl { font-size: 1.8mm; font-weight: 700; color: #5d7266; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .val { margin-top: 1.4mm; font-size: 3.5mm; font-weight: 800; line-height: 1.2; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }
  .val.big { font-size: 4.2mm; color: #0b3d22; }
  .foot { position: absolute; left: 0; right: 0; bottom: 0; height: 9mm; padding: 0 5mm 0 9mm; color: #fff; background: linear-gradient(110deg, #1f9d57, #279a58 55%, #3fc47c); border-top: .6mm solid #f2b705; display: flex; align-items: center; gap: 2mm; font-size: 2.9mm; white-space: nowrap; }
  .foot b { letter-spacing: .25mm; }
  @media print { html, body { background: none; } body { display: block; min-height: 0; } }
  </style></head><body><div class="card">
    <div class="bar1"></div><div class="bar2"></div>
    <div class="org"><div class="chip">${esc(orgInitials(c.amcosName))}</div><div class="nm">${esc(society)}</div></div>
    <div class="photo">${photo}</div>
    <div class="code">${code128Svg(barcodeOf)}<span>${esc(barcodeOf)}</span></div>
    <div class="head"><div class="t">KITAMBULISHO CHA MWANACHAMA</div><div class="s">${esc([society, c.amcosAddress].filter(Boolean).join('  |  '))}</div></div>
    <div class="grid">
      ${field('NAMBA YA UANACHAMA (SHAMBA)', shamba, 'big')}
      ${field('TAREHE ILIYOTOLEWA', c.issuedOn)}
      ${field('JINA LA MWANACHAMA', c.name)}
      ${field('KIJIJI ANAKOTOKEA', [c.village, c.ward].filter(Boolean).join(', '))}
    </div>
    <div class="foot"><b>TAMBUKA:</b><span>Kulipa michango yako kwa wakati</span></div>
  </div><script>window.onload=function(){setTimeout(function(){window.print();},300);};</script></body></html>`;
};

/** Opens the card in its own window and starts printing. Returns false when the browser blocked the window. */
export function printFarmerId(card: FarmerIdCardData): boolean {
  const w = window.open('', '_blank', 'width=720,height=560');
  if (!w) return false;
  w.document.open();
  w.document.write(cardHtml(card));
  w.document.close();
  return true;
}
