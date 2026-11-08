/* Prints a farmer's membership identity card, modelled on the green paper card AMCOS members already carry:
   photo and society stamp on top, then the member's details on dotted lines, and the reminder to pay contributions on time. */

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

const cardHtml = (c: FarmerIdCardData) => {
  const row = (label: string, value: string) =>
    `<div class="row"><span class="lbl">${esc(label)}</span><span class="val">${esc(value || '')}</span></div>`;
  const photo = c.photoUrl
    ? `<img src="${esc(c.photoUrl)}" alt="" />`
    : `<div class="ph">${esc(c.initials)}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Member ID - ${esc(c.name)}</title><style>
  @page { size: 105mm 74mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #e8e8e8; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { display: grid; place-items: center; min-height: 100vh; font-family: 'Helvetica Neue', Arial, sans-serif; }
  .card { position: relative; width: 105mm; height: 74mm; overflow: hidden; background: linear-gradient(160deg, #3fc47c 0%, #2faa63 60%, #279a58 100%); color: #0b3d22; padding: 4mm 5mm; }
  .card::before { content: ''; position: absolute; right: -16mm; bottom: -22mm; width: 62mm; height: 62mm; border-radius: 50%; background: rgba(255,255,255,.10); }
  .card::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2.2mm; background: #f2b705; }
  .top { position: relative; display: flex; gap: 4mm; align-items: flex-start; height: 27mm; }
  .photo { width: 22mm; height: 27mm; background: #fff; padding: 1mm; border-radius: 1mm; box-shadow: 0 .4mm 1.2mm rgba(0,0,0,.3); flex-shrink: 0; }
  .photo img, .photo .ph { width: 100%; height: 100%; object-fit: cover; display: grid; place-items: center; background: #2d6cdf; color: #fff; font-size: 7mm; font-weight: 700; }
  .head { flex: 1; text-align: center; padding-top: 1mm; }
  .stamp { display: inline-block; border: .5mm solid #1f3f9a; color: #1f3f9a; border-radius: 50%; padding: 2.4mm 4mm; transform: rotate(-6deg); opacity: .85; max-width: 52mm; }
  .stamp b { display: block; font-size: 2.6mm; letter-spacing: .15mm; text-transform: uppercase; line-height: 1.25; }
  .stamp span { display: block; font-size: 2.2mm; margin-top: .6mm; }
  .society { position: relative; margin-top: 1.6mm; font-size: 2.55mm; font-weight: 700; line-height: 1.3; text-transform: uppercase; color: #082f1a; }
  .society small { display: block; font-weight: 600; text-transform: none; font-size: 2.4mm; }
  .rows { position: relative; margin-top: 1.4mm; }
  .row { display: flex; align-items: baseline; gap: 1.5mm; font-size: 2.6mm; font-weight: 700; text-transform: uppercase; margin-top: 1.3mm; }
  .lbl { white-space: nowrap; }
  .val { flex: 1; min-width: 0; border-bottom: .3mm dotted #0b3d22; padding: 0 1mm; font: italic 600 3.4mm 'Bradley Hand', 'Segoe Script', 'Comic Sans MS', cursive; color: #15213f; text-transform: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { position: relative; margin-top: 2mm; font-size: 2.6mm; font-weight: 700; }
  .note i { font-weight: 600; }
  @media print { html, body { background: none; } body { display: block; min-height: 0; } }
  </style></head><body><div class="card">
    <div class="top">
      <div class="photo">${photo}</div>
      <div class="head"><div class="stamp"><b>${esc(c.amcosName)}</b><span>${esc(c.amcosAddress)}</span>${c.amcosCode ? `<span>Reg. ${esc(c.amcosCode)}</span>` : ''}</div></div>
    </div>
    <div class="society">${esc(c.amcosName)}<small>${esc(c.amcosAddress)}</small></div>
    <div class="rows">
      ${row('JINA LA MWANACHAMA', c.name)}
      ${row('NAMBA YA UANACHAMA (SHAMBA)', c.shamba || c.farmerId)}
      ${row('KIJIJI ANAKOTOKEA', [c.village, c.ward].filter(Boolean).join(', '))}
      ${row('TAREHE ILIYOTOLEWA', c.issuedOn)}
    </div>
    <div class="note">TAMBUKA: <i>Kulipa Michango yako kwa wakati</i></div>
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
