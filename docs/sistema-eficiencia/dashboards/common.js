// Inline SVG helpers (no external libs). All marks follow dataviz mark specs: thin bars, 4px rounded ends, 2px lines.
const C = {s1:'#a8552a',s2:'#17998e',s3:'#b8862b',s4:'#4a6cc0',s5:'#a03a62',ok:'#3f8f4f',warn:'#b8862b',bad:'#c0392b',crit:'#7e0000',idle:'#7f8aa3',ink:'#241a12',muted:'#8c7f74',line:'#ece5dc',cafe2:'#5d3c29'};
function svg(w,h,inner,cls=''){return `<svg class="${cls}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img">${inner}</svg>`;}
// horizontal bars: data=[{label,value,color?,sub?}], max optional
function hbars(w,data,{max,labelW=120,rowH=26,valueFmt=v=>v,color=C.cafe2,gap=8}={}){
  const m=max||Math.max(...data.map(d=>d.value))*1.05; const bw=w-labelW-60; let y=0,out='';
  data.forEach(d=>{const bl=Math.max(4,d.value/m*bw);
    out+=`<text x="0" y="${y+rowH/2+4}" font-size="11.5" fill="${C.ink}">${d.label}</text>
      <rect x="${labelW}" y="${y+rowH/2-5}" width="${bw}" height="10" rx="4" fill="#f1ebe3"/>
      <rect x="${labelW}" y="${y+rowH/2-5}" width="${bl}" height="10" rx="4" fill="${d.color||color}"/>
      <text x="${labelW+bl+8}" y="${y+rowH/2+4}" font-size="11.5" fill="${C.muted}">${valueFmt(d.value)}</text>`; y+=rowH;});
  return svg(w,y,out);
}
// stacked horizontal 100% bar: segs=[{label,value,color}]
function stack(w,h,segs,{gap=2}={}){const t=segs.reduce((a,s)=>a+s.value,0);let x=0,out='';
  segs.forEach((s,i)=>{const sw=s.value/t*w-(i<segs.length-1?gap:0);out+=`<rect x="${x}" y="0" width="${Math.max(sw,2)}" height="${h}" rx="4" fill="${s.color}"/>`;x+=sw+gap;});
  return svg(w,h,out);}
// line chart: series=[{values:[],color}], labels=[]
function line(w,h,series,labels,{min=0,max,pad={l:34,r:10,t:10,b:22},bands,fmt=v=>v,marker=true}={}){
  const mx=max||Math.max(...series.flatMap(s=>s.values))*1.1; const iw=w-pad.l-pad.r, ih=h-pad.t-pad.b; const n=labels.length;
  const X=i=>pad.l+i*(iw/(n-1)), Y=v=>pad.t+ih-(v-min)/(mx-min)*ih; let out='';
  if(bands){bands.forEach(b=>{out+=`<rect x="${pad.l}" y="${Y(b.to)}" width="${iw}" height="${Y(b.from)-Y(b.to)}" fill="${b.color}" opacity=".9"/>`;});}
  for(let g=0;g<=4;g++){const v=min+(mx-min)*g/4, y=Y(v); out+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${y}" y2="${y}" class="grid-line"/><text x="${pad.l-6}" y="${y+3.5}" text-anchor="end" class="axis">${fmt(Math.round(v))}</text>`;}
  labels.forEach((l,i)=>{out+=`<text x="${X(i)}" y="${h-6}" text-anchor="middle" class="axis">${l}</text>`;});
  series.forEach(s=>{const d=s.values.map((v,i)=>`${i?'L':'M'}${X(i)},${Y(v)}`).join(' ');
    out+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    if(marker){s.values.forEach((v,i)=>{out+=`<circle cx="${X(i)}" cy="${Y(v)}" r="3.5" fill="${s.color}" stroke="#fff" stroke-width="2"/>`;});}
    const last=s.values.length-1; out+=`<text x="${X(last)+6}" y="${Y(s.values[last])+4}" font-size="11" font-weight="600" fill="${s.color}">${s.label||''}</text>`;});
  return svg(w,h,out);}
// vertical grouped/single columns
function cols(w,h,data,{max,pad={l:30,r:6,t:8,b:22},color=C.cafe2,fmt=v=>v,labelEvery=1}={}){
  const mx=max||Math.max(...data.map(d=>d.value))*1.15; const iw=w-pad.l-pad.r, ih=h-pad.t-pad.b; const n=data.length; const bw=Math.min(28,iw/n*0.6); let out='';
  for(let g=0;g<=3;g++){const v=mx*g/3,y=pad.t+ih-v/mx*ih; out+=`<line x1="${pad.l}" x2="${w-pad.r}" y1="${y}" y2="${y}" class="grid-line"/><text x="${pad.l-6}" y="${y+3.5}" text-anchor="end" class="axis">${fmt(Math.round(v))}</text>`;}
  data.forEach((d,i)=>{const x=pad.l+i*(iw/n)+(iw/n-bw)/2; const bh=Math.max(4,d.value/mx*ih); const y=pad.t+ih-bh;
    out+=`<path d="M${x},${pad.t+ih} V${y+4} Q${x},${y} ${x+4},${y} H${x+bw-4} Q${x+bw},${y} ${x+bw},${y+4} V${pad.t+ih} Z" fill="${d.color||color}"/>`;
    if(i%labelEvery===0) out+=`<text x="${x+bw/2}" y="${h-6}" text-anchor="middle" class="axis">${d.label}</text>`;
    if(d.show!==false) out+=`<text x="${x+bw/2}" y="${y-5}" text-anchor="middle" font-size="10.5" fill="${C.muted}">${fmt(d.value)}</text>`;});
  return svg(w,h,out);}
// heatmap: rows=[{label,values:[]}], cols=[] ; scale fn -> color
function heat(w,rows,colsLab,{labelW=130,cell=22,gap=3,scale}={}){
  const cw=(w-labelW-10)/colsLab.length; let out='',y=0;
  colsLab.forEach((c,i)=>{out+=`<text x="${labelW+i*cw+cw/2}" y="10" text-anchor="middle" class="axis">${c}</text>`;}); y=18;
  rows.forEach(r=>{out+=`<text x="0" y="${y+cell/2+4}" font-size="11.5" fill="${C.ink}">${r.label}</text>`;
    r.values.forEach((v,i)=>{out+=`<rect x="${labelW+i*cw+gap/2}" y="${y}" width="${cw-gap}" height="${cell}" rx="4" fill="${scale(v)}"/>`+(v>=100?`<text x="${labelW+i*cw+cw/2}" y="${y+cell/2+3.5}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#fff">${v}</text>`:'');});
    y+=cell+gap;});
  return svg(w,y,out);}
// semicircle gauge with bands
function gauge(w,value,{bands,max=130,label=''}={}){
  const cx=w/2, cy=w/2*0.78, r=w/2-18, sw=16; const ang=v=>Math.PI*(1-Math.min(v,max)/max);
  const arc=(a0,a1,col)=>{const x0=cx+r*Math.cos(a0),y0=cy-r*Math.sin(a0),x1=cx+r*Math.cos(a1),y1=cy-r*Math.sin(a1);return `<path d="M${x0},${y0} A${r},${r} 0 ${(a0-a1)>Math.PI?1:0} 1 ${x1},${y1}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="butt"/>`;};
  let out=''; bands.forEach(b=>{out+=arc(ang(b.from),ang(b.to),b.color);});
  const a=ang(value), nx=cx+(r-26)*Math.cos(a), ny=cy-(r-26)*Math.sin(a);
  out+=`<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="5" fill="${C.ink}"/>`;
  out+=`<text x="${cx}" y="${cy+34}" text-anchor="middle" font-size="30" font-weight="600" fill="#392617">${value}%</text><text x="${cx}" y="${cy+52}" text-anchor="middle" class="lab">${label}</text>`;
  bands.forEach(b=>{const m=ang((b.from+b.to)/2),tx=cx+(r+16)*Math.cos(m),ty=cy-(r+16)*Math.sin(m);out+=`<text x="${tx}" y="${ty+3}" text-anchor="middle" font-size="9.5" fill="${C.muted}">${b.label}</text>`;});
  return svg(w,cy+60,out,'gauge');}
function fill(id,html){document.getElementById(id).innerHTML=html;}
