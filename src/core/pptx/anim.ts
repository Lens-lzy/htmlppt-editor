// 动画/转场解析：把 slide 的 <p:timing> 时间线与 <p:transition> 提取成精简清单(manifest)，
// 再由嵌入的「放映运行时」按单击/与上一动画同时/上一动画之后逐步播放。
//
// 重要：动画只在「放映」时由 JS 驱动（预览 iframe / 导出后独立打开）。编辑器 iframe 禁脚本，
// 因此始终显示最终态、可正常编辑——运行时不会在编辑器里运行，也就不会把元素藏起来。

import { child, children, attr, numAttr, descendants, firstDesc } from './ooxml'

export interface AnimStep {
  spid: string
  kind: 'entr' | 'exit' | 'emph'
  preset: string // fade | fly | zoom | wipe | float | appear | split | spin | pulse
  dir: string // l | r | t | b（fly/wipe/float 方向）
  durMs: number
  delayMs: number
  trigger: 'click' | 'withPrev' | 'afterPrev'
}

export interface SlideAnim {
  transition: { type: string; durMs: number } | null
  steps: AnimStep[]
}

// 入场 presetID -> 归一化效果名
const ENTR: Record<number, string> = {
  1: 'appear',
  2: 'fly',
  10: 'fade',
  22: 'wipe',
  23: 'zoom',
  36: 'float',
  37: 'float',
  53: 'zoom',
}
const EXIT: Record<number, string> = {
  1: 'disappear',
  2: 'fly',
  10: 'fade',
  22: 'wipe',
  23: 'zoom',
}
// fly/wipe 方向 presetSubtype -> 方向
const DIR: Record<number, string> = { 1: 't', 2: 'r', 4: 'b', 8: 'l', 10: 'r', 5: 'b', 9: 'l' }

function presetName(kind: string, id: number): string {
  if (kind === 'exit') return EXIT[id] || 'fade'
  if (kind === 'emph') return 'pulse'
  return ENTR[id] || 'fade'
}

/** 在一个效果节点(cTn)内找时长（ms）：优先自身 dur，否则取后代 cBhvr 的 cTn dur */
function durationOf(cTn: Element): number {
  const own = attr(cTn, 'dur')
  if (own && own !== 'indefinite') {
    const n = Number(own)
    if (Number.isFinite(n)) return n
  }
  for (const inner of descendants(cTn, 'cTn')) {
    const d = attr(inner, 'dur')
    if (d && d !== 'indefinite') {
      const n = Number(d)
      if (Number.isFinite(n)) return n
    }
  }
  return 500
}

/** 起始延迟：自身 stCondLst 的第一个 cond@delay */
function delayOf(cTn: Element): number {
  const cond = firstDesc(child(cTn, 'stCondLst'), 'cond')
  const d = attr(cond, 'delay')
  if (d && d !== 'indefinite') {
    const n = Number(d)
    if (Number.isFinite(n)) return n
  }
  return 0
}

export function parseSlideAnim(slideDoc: Document): SlideAnim {
  const root = slideDoc.documentElement
  // 转场
  let transition: SlideAnim['transition'] = null
  const tr = child(root, 'transition')
  if (tr) {
    const typeEl = Array.from(tr.children)[0]
    const type = typeEl ? typeEl.localName || typeEl.tagName.replace(/^.*:/, '') : 'fade'
    const spd = attr(tr, 'spd') || ''
    const dur = numAttr(tr, 'dur', spd === 'slow' ? 1000 : spd === 'fast' ? 250 : 500)
    transition = { type, durMs: dur }
  }

  // 时间线：收集所有带 presetClass 的效果节点(cTn)，按文档顺序
  const steps: AnimStep[] = []
  const timing = child(root, 'timing')
  if (timing) {
    for (const cTn of descendants(timing, 'cTn')) {
      const presetClass = attr(cTn, 'presetClass')
      if (!presetClass) continue
      const spTgt = firstDesc(cTn, 'spTgt')
      const spid = attr(spTgt, 'spid')
      if (!spid) continue
      const kind: AnimStep['kind'] =
        presetClass === 'exit' ? 'exit' : presetClass === 'emph' ? 'emph' : 'entr'
      const presetID = numAttr(cTn, 'presetID', 0)
      const subtype = numAttr(cTn, 'presetSubtype', 0)
      const nodeType = attr(cTn, 'nodeType') || ''
      const trigger: AnimStep['trigger'] =
        nodeType === 'clickEffect' ? 'click' : nodeType === 'afterEffect' ? 'afterPrev' : 'withPrev'
      steps.push({
        spid,
        kind,
        preset: presetName(kind, presetID),
        dir: DIR[subtype] || 'l',
        durMs: durationOf(cTn),
        delayMs: delayOf(cTn),
        trigger,
      })
    }
  }
  return { transition, steps }
}

export function hasAnimations(anims: SlideAnim[]): boolean {
  return anims.some((a) => a.steps.length > 0 || a.transition)
}

// ---------- 放映运行时（注入到生成的 HTML，独立打开/预览时运行） ----------

export const ANIM_CSS = `
@keyframes pptx-fade-in{from{opacity:0}to{opacity:1}}
@keyframes pptx-fade-out{from{opacity:1}to{opacity:0}}
@keyframes pptx-zoom-in{from{opacity:0;transform:scale(.3)}to{opacity:1;transform:scale(1)}}
@keyframes pptx-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
.pptx-present-overlay{position:fixed;inset:0;background:#1b1b1b;z-index:2147483000;display:none;align-items:center;justify-content:center;overflow:hidden}
.pptx-present-overlay.on{display:flex}
.pptx-present-hint{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);color:#bbb;font:12px/1.4 sans-serif;background:rgba(0,0,0,.5);padding:6px 12px;border-radius:8px;z-index:2147483001;pointer-events:none}
.pptx-play-btn{position:fixed;right:18px;bottom:18px;z-index:2147482000;background:#2f6fe0;color:#fff;border:none;border-radius:24px;padding:10px 18px;font:600 14px/1 sans-serif;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.3)}
`

/** 放映运行时脚本（字符串注入）。读取 #pptx-anim 清单，按页放映。 */
export const ANIM_RUNTIME = `(function(){
  var dataEl=document.getElementById('pptx-anim');if(!dataEl)return;
  var M;try{M=JSON.parse(dataEl.textContent||'{}')}catch(e){return}
  var slides=Array.prototype.slice.call(document.querySelectorAll('section.slide'));
  if(!slides.length)return;
  // 放映按钮
  var btn=document.createElement('button');btn.className='pptx-play-btn';btn.textContent='▶ 放映';document.body.appendChild(btn);
  var overlay=document.createElement('div');overlay.className='pptx-present-overlay';
  var stage=document.createElement('div');stage.style.cssText='transform-origin:center center;position:relative';
  overlay.appendChild(stage);
  var hint=document.createElement('div');hint.className='pptx-present-hint';hint.textContent='单击/→/空格 下一步 · ← 上一步 · Esc 退出';
  document.body.appendChild(overlay);document.body.appendChild(hint);hint.style.display='none';
  var cur=-1,placeholder=null,groups=[],gi=0;
  function fit(sec){var sw=sec.offsetWidth||1280,sh=sec.offsetHeight||720;var s=Math.min(window.innerWidth/sw,window.innerHeight/sh);stage.style.transform='scale('+s+')';stage.style.width=sw+'px';stage.style.height=sh+'px';}
  function buildGroups(anim){ // 把 steps 按 click 分组（click 起新组，with/after 并入当前组）
    var g=[],c=null;(anim.steps||[]).forEach(function(st){if(st.trigger==='click'||!c){c=[];g.push(c)}c.push(st)});return g;}
  function applyInit(sec,anim){ // 进入该页：入场元素先藏起
    (anim.steps||[]).forEach(function(st){if(st.kind==='entr'){var el=sec.querySelector('[data-spid="'+st.spid+'"]');if(el){el.style.visibility='hidden';el.style.opacity=''}}});}
  function runStep(sec,st,extraDelay){
    var el=sec.querySelector('[data-spid="'+st.spid+'"]');if(!el)return;
    var delay=(st.delayMs||0)+(extraDelay||0);var dur=(st.durMs||500);
    setTimeout(function(){
      el.style.visibility='visible';
      if(st.kind==='entr'){
        var name=st.preset==='zoom'?'pptx-zoom-in':st.preset==='appear'?null:'pptx-fade-in';
        if(st.preset==='fly'){var from=({l:'-60px,0',r:'60px,0',t:'0,-60px',b:'0,60px'})[st.dir]||'-60px,0';el.animate([{opacity:0,transform:'translate('+from+')'},{opacity:1,transform:'translate(0,0)'}],{duration:dur,easing:'ease-out',fill:'both'})}
        else if(name){el.style.animation=name+' '+dur+'ms ease-out both'}
      } else if(st.kind==='exit'){
        el.animate([{opacity:1},{opacity:0}],{duration:dur,fill:'both'})
      } else {el.style.animation='pptx-pulse '+dur+'ms ease-in-out'}
    },delay);
  }
  function showSlide(i){
    if(i<0||i>=slides.length)return;
    // 还原上一页
    if(placeholder){placeholder.parentNode.replaceChild(slides[cur],placeholder);placeholder=null;slides[cur].style.visibility='';slides[cur].querySelectorAll('[data-spid]').forEach(function(e){e.style.visibility='';e.style.animation='';})}
    cur=i;var sec=slides[i];
    placeholder=document.createComment('slide');sec.parentNode.replaceChild(placeholder,sec);
    stage.innerHTML='';stage.appendChild(sec);sec.style.margin='0';fit(sec);
    var anim=(M.slides&&M.slides[i])||{steps:[]};
    groups=buildGroups(anim);gi=0;applyInit(sec,anim);
    // 转场：整页淡入
    if(anim.transition){sec.animate([{opacity:0},{opacity:1}],{duration:anim.transition.durMs||500})}
  }
  function advance(){
    var sec=slides[cur];if(!sec)return;
    if(gi<groups.length){var grp=groups[gi++];var acc=0;grp.forEach(function(st){var ex=st.trigger==='afterPrev'?acc:0;runStep(sec,st,ex);if(st.trigger==='afterPrev')acc+=st.durMs;});}
    else{ if(cur<slides.length-1)showSlide(cur+1); else exit(); }
  }
  function back(){ if(cur>0)showSlide(cur-1); }
  function enter(){overlay.classList.add('on');hint.style.display='';showSlide(0);}
  function exit(){overlay.classList.remove('on');hint.style.display='none';if(placeholder){placeholder.parentNode.replaceChild(slides[cur],placeholder);placeholder=null;}slides.forEach(function(s){s.style.visibility='';s.style.margin='';s.querySelectorAll('[data-spid]').forEach(function(e){e.style.visibility='';e.style.animation='';})});}
  btn.addEventListener('click',enter);
  overlay.addEventListener('click',function(e){if(e.target===overlay||e.target===stage)advance();else advance();});
  window.addEventListener('keydown',function(e){if(!overlay.classList.contains('on'))return;if(e.key==='Escape')exit();else if(e.key==='ArrowLeft')back();else if(e.key==='ArrowRight'||e.key===' '||e.key==='Enter'){e.preventDefault();advance();}});
  window.addEventListener('resize',function(){if(overlay.classList.contains('on')&&slides[cur])fit(slides[cur]);});
})();`
