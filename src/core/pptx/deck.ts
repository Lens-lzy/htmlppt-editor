// 滚动 deck：把生成的 HTML 变成「一屏一页、滚动/滚轮切换、右侧圆点指示」的演示页。
// CSS + 运行时一起内置进生成的 HTML —— 导出后独立打开即生效；PPTX 编辑器 iframe 允许脚本，
// 因此编辑时也是同样的滚动翻页形态。
//
// 关键：用 CSS `zoom` 把固定 1280×720 的 .slide 缩放铺满视口（zoom 影响布局盒，
// 滚动吸附与编辑器选择框坐标都能正确跟随），而非 transform（不改布局、无法吸附）。
// 让文档自然滚动（不强制 height:100%/overflow），scroll-snap 挂在文档滚动容器上。

export const DECK_CSS = `
html{scroll-snap-type:y mandatory;scroll-behavior:smooth}
.deck{padding:0}
.slide{scroll-snap-align:center;margin:0 auto !important}
.pptx-dots{
  position:fixed;right:16px;top:50%;transform:translateY(-50%);
  display:flex;flex-direction:column;gap:10px;z-index:2147482000;
}
.pptx-dot{
  width:11px;height:11px;border-radius:50%;padding:0;cursor:pointer;
  background:rgba(0,0,0,.28);border:1.5px solid rgba(255,255,255,.75);
  transition:background .15s,transform .15s;
}
.pptx-dot:hover{transform:scale(1.25)}
.pptx-dot.on{background:#2f6fe0;border-color:#2f6fe0;transform:scale(1.3)}
`

/** 滚动 deck 运行时：缩放每页铺满视口 + 右侧圆点（跟随/跳转）+ 滚动吸附 */
export const DECK_RUNTIME = `(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  if(!slides.length)return;
  // 编辑器内：跳过 per-slide 缩放（否则破坏拖拽精度），缩放交给编辑器的整体 frameZoom；
  // 独立打开时：用 zoom 把每页缩放铺满视口。
  var EDIT=document.documentElement.hasAttribute('data-hve-edit');
  function scroller(){return document.scrollingElement||document.documentElement;}
  function dims(){var cs=getComputedStyle(slides[0]);return [parseFloat(cs.width)||1280, parseFloat(cs.height)||720];}
  function fit(){
    var vw=window.innerWidth, vh=window.innerHeight, d=dims();
    var z=EDIT?1:Math.min((vw-48)/d[0],(vh-32)/d[1]); if(!isFinite(z)||z<=0)z=1;
    var gap=Math.max(8,(vh-d[1]*z)/2);
    slides.forEach(function(s){s.style.zoom=EDIT?'':z; s.style.marginTop=gap+'px'; s.style.marginBottom=gap+'px';});
  }
  function goTo(s){
    // 临时关吸附（否则平滑滚动被中途吸附点截停）；用 scrollIntoView 让浏览器处理 zoom 坐标
    var html=document.documentElement; var prev=html.style.scrollSnapType; html.style.scrollSnapType='none';
    s.scrollIntoView({behavior:'smooth', block:'center'});
    setTimeout(function(){html.style.scrollSnapType=prev||'';}, 700);
  }
  // 右侧圆点（幂等：先清旧的）
  var old=document.querySelector('.pptx-dots'); if(old)old.remove();
  var wrap=document.createElement('div'); wrap.className='pptx-dots';
  slides.forEach(function(s,i){
    var b=document.createElement('button'); b.className='pptx-dot'; b.title='第'+(i+1)+'页';
    b.addEventListener('click',function(){goTo(s);});
    wrap.appendChild(b);
  });
  document.body.appendChild(wrap);
  var dots=[].slice.call(wrap.children);
  function mark(i){dots.forEach(function(d,j){d.classList.toggle('on',j===i);});}
  mark(0);
  if(window.IntersectionObserver){
    var io=new IntersectionObserver(function(es){
      var best=-1,ratio=0;
      es.forEach(function(e){ if(e.isIntersecting&&e.intersectionRatio>ratio){ratio=e.intersectionRatio;best=slides.indexOf(e.target);} });
      if(best>=0)mark(best);
    },{threshold:[0.3,0.55,0.8]});
    slides.forEach(function(s){io.observe(s);});
  }
  fit();
  window.addEventListener('resize',fit);
})();`
