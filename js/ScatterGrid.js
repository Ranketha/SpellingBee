import{jsx as _jsx,jsxs as _jsxs}from"react/jsx-runtime";import{addPropertyControls,ControlType,useIsStaticRenderer}from"framer";import{useEffect,useRef}from"react";const STEPS=14// colour ramp resolution, base → accent
;const FIXED=1/60;// Upper bound on live dots. An aggressive Dot/Gap combo on a large heading
// would otherwise scale simulation cost with on-screen area unbounded; past
// this count the grid step is grown until the dot count fits.
const MAX_DOTS=6e3;// Resize events are coalesced to at most one rebuild per this many ms, so a
// container inside an animated/elastic layout can't trigger a burst of full
// text-rasterization + pixel-scan passes.
const RESIZE_DEBOUNCE_MS=120;// Standard visually-hidden: out of sight, still read by crawlers and
// screen readers. Not display:none, which would remove it from both.
const srOnly={position:"absolute",width:1,height:1,margin:-1,padding:0,border:0,overflow:"hidden",whiteSpace:"nowrap",clipPath:"inset(50%)"};function parseColor(value){const found=value.match(/-?\d+(\.\d+)?/g);if(!found||found.length<3)return[13,13,13];return[Number(found[0]),Number(found[1]),Number(found[2])];}function buildRamp(from,to){const ramp=[];for(let i=0;i<STEPS;i++){const t=i/(STEPS-1);const r=Math.round(from[0]+(to[0]-from[0])*t);const g=Math.round(from[1]+(to[1]-from[1])*t);const b=Math.round(from[2]+(to[2]-from[2])*t);ramp.push(`rgb(${r}, ${g}, ${b})`);}return ramp;}/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 * @framerIntrinsicWidth 700
 * @framerIntrinsicHeight 220
 * @framerDisableUnlink
 */export default function ScatterGrid({text="Bonjour",tag="h2",font,fit=true,dotSize=4,dotGap=1,radius=150,strength=1.8,stiffness=.01,damping=.86,bleed=0,breathe=true,accent="rgb(198, 237, 43)",base="rgb(13, 13, 13)",style}){// Bind the Accent swatch to a colour style and Framer hands us a
// var(--token-…) string already — use it as-is so the glow follows
// light/dark mode. Otherwise the raw swatch value is used directly.
const accentValue=accent;const hostRef=useRef(null);const canvasRef=useRef(null);const baseProbe=useRef(null);const accentProbe=useRef(null);const fontProbe=useRef(null);// Serialised so the effect re-runs when any part of the font changes.
const fontKey=JSON.stringify(font||{});// True on the Framer canvas AND during thumbnail/export rendering —
// covers both cases the marketplace static-renderer check cares about,
// unlike a RenderTarget.canvas check which only catches the former.
const isStatic=useIsStaticRenderer();useEffect(()=>{const hostEl=hostRef.current;const canvasEl=canvasRef.current;if(!hostEl||!canvasEl)return;const context=canvasEl.getContext("2d");if(!context)return;// Re-bound with explicit types: the helpers below are hoisted, so the
// narrowing from the guards above does not reach inside them.
const host=hostEl;const canvas=canvasEl;const ctx=context;const reduced=typeof window!=="undefined"&&window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;const still=isStatic||reduced;const minStep=Math.max(2,dotSize+dotGap);let step=minStep;let dots=[];let ripples=[];let width=0;let height=0;let ramp=buildRamp(parseColor(base),parseColor(accent));let pointerX=-9999;let pointerY=-9999;let frame=0;let raf=0;let last=0;let acc=0;let clock=0;// True while the host is off-screen or the tab is hidden. The rAF
// loop keeps scheduling itself while paused (cheap) but skips
// simulate/paint, so it resumes instantly with no re-registration.
let paused=false;// Resolve the CSS variables the probes carry into concrete rgb values,
// so canvas can paint them. Re-read periodically to catch theme flips.
function readColors(){const b=baseProbe.current;const a=accentProbe.current;if(!b||!a)return;ramp=buildRamp(parseColor(getComputedStyle(b).color),parseColor(getComputedStyle(a).color));}// Rasterise the word once, then keep every grid cell that lands on ink.
function build(){const rect=host.getBoundingClientRect();// The canvas is grown by `bleed` on every side and pulled back
// out with negative offsets, so squares flung past the layout
// box are still inside the bitmap and keep being drawn. CSS
// overflow can't do this on its own — a canvas has no pixels
// beyond its size.
const boxW=Math.max(1,Math.round(rect.width));const boxH=Math.max(1,Math.round(rect.height));width=boxW+bleed*2;height=boxH+bleed*2;const dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+"px";canvas.style.height=height+"px";canvas.style.left=-bleed+"px";canvas.style.top=-bleed+"px";ctx.setTransform(dpr,0,0,dpr,0,0);const mask=document.createElement("canvas");mask.width=width;mask.height=height;const mctx=mask.getContext("2d",{willReadFrequently:true});if(!mctx)return;// Read the font off the probe, which carries whatever the Font
// control resolved to — family, weight, style, size and tracking.
// Going through a real element means Framer's font library and
// its webfont loading do the work; canvas only needs the final
// string.
let family='"Inter Display", "Inter", sans-serif';let fWeight="800";let fStyle="normal";let chosen=boxH*.92;let trackEm=-.04;const probe=fontProbe.current;if(probe){const cs=getComputedStyle(probe);if(cs.fontFamily)family=cs.fontFamily;if(cs.fontWeight)fWeight=cs.fontWeight;if(cs.fontStyle)fStyle=cs.fontStyle;const px=parseFloat(cs.fontSize);if(px>0)chosen=px;// Held as a ratio so tracking stays proportional if the size
// is rescaled to fit below.
const track=parseFloat(cs.letterSpacing);trackEm=isFinite(track)&&px>0?track/px:0;}const fontString=px=>`${fStyle} ${fWeight} ${px}px ${family}`;try{mctx.letterSpacing=trackEm+"em";}catch(e){// Older Safari has no ctx.letterSpacing — tracking is cosmetic.
}let size=chosen;mctx.font=fontString(size);if(fit){// Shrink-to-fit: the chosen size is a ceiling, only scaled
// down when the text would otherwise overflow the box.
// Rescaling unconditionally here would cancel `size` out of
// the ratio below (measured width is itself proportional to
// size), making the Font control's size field a no-op.
const measured=mctx.measureText(text).width;if(measured>0){const fitSize=Math.min(size*(boxW*.96/measured),boxH*.95);size=Math.min(size,fitSize);mctx.font=fontString(size);}}mctx.textAlign="center";mctx.textBaseline="middle";mctx.fillStyle="#000";mctx.fillText(text,width/2,height/2);const data=mctx.getImageData(0,0,width,height).data;// Count ink cells at the natural step first; if that would put
// us over MAX_DOTS, grow the step (coarser grid) and recount
// instead of ever materialising the oversized dot array.
const countAt=s=>{let n=0;const half=s/2;for(let y=half;y<height;y+=s){for(let x=half;x<width;x+=s){const px=(Math.round(y)*width+Math.round(x))*4;if(data[px+3]>128)n++;}}return n;};step=minStep;let count=countAt(step);let guard=0;while(count>MAX_DOTS&&guard<20){step*=1.15;count=countAt(step);guard++;}const next=[];const half=step/2;for(let y=half;y<height;y+=step){for(let x=half;x<width;x+=step){const px=(Math.round(y)*width+Math.round(x))*4;if(data[px+3]>128){next.push({hx:x,hy:y,x,y,vx:0,vy:0});}}}dots=next;}function simulate(){const r2=radius*radius;for(let i=0;i<dots.length;i++){const d=dots[i];const dx=d.x-pointerX;const dy=d.y-pointerY;const dist2=dx*dx+dy*dy;if(dist2<r2&&dist2>.5){const dist=Math.sqrt(dist2);const f=(1-dist/radius)*strength;d.vx+=dx/dist*f;d.vy+=dy/dist*f;}for(let j=0;j<ripples.length;j++){const rp=ripples[j];const rx=d.x-rp.x;const ry=d.y-rp.y;const rd=Math.sqrt(rx*rx+ry*ry)||1;const band=Math.abs(rd-rp.r);if(band<26){const f=(1-band/26)*2.4;d.vx+=rx/rd*f;d.vy+=ry/rd*f;}}d.vx+=(d.hx-d.x)*stiffness;d.vy+=(d.hy-d.y)*stiffness;d.vx*=damping;d.vy*=damping;d.x+=d.vx;d.y+=d.vy;}for(let j=ripples.length-1;j>=0;j--){ripples[j].r+=14;if(ripples[j].r>Math.max(width,height)*1.2){ripples.splice(j,1);}}}function paint(){ctx.clearRect(0,0,width,height);const wave=breathe&&!still;for(let i=0;i<dots.length;i++){const d=dots[i];const ox=d.x-d.hx;const oy=d.y-d.hy;const disp=Math.sqrt(ox*ox+oy*oy);let level=Math.min(1,disp/24);let lift=0;if(wave){// A slow sweep so the field still breathes with no pointer.
const s=Math.sin(d.hx*.012-clock*1.6);lift=s*1.2;level=Math.max(level,Math.max(0,s-.86)*3.2);}const idx=Math.min(STEPS-1,Math.max(0,Math.round(level*(STEPS-1))));ctx.fillStyle=ramp[idx];ctx.fillRect(Math.round(d.x-dotSize/2),Math.round(d.y+lift-dotSize/2),dotSize,dotSize);}}function loop(now){// Kept alive at low cost so it resumes the instant the host is
// back in view or the tab is foregrounded again — no observer
// re-registration needed.
if(paused){last=0;raf=requestAnimationFrame(loop);return;}const dt=last?Math.min(.05,(now-last)/1e3):FIXED;last=now;clock+=dt;acc+=dt;let guard=0;while(acc>=FIXED&&guard<5){simulate();acc-=FIXED;guard++;}if(frame%30===0)readColors();frame++;paint();raf=requestAnimationFrame(loop);}function onPointerMove(event){const rect=canvas.getBoundingClientRect();pointerX=event.clientX-rect.left;pointerY=event.clientY-rect.top;}function onPointerLeave(){pointerX=-9999;pointerY=-9999;}function onPointerDown(event){const rect=canvas.getBoundingClientRect();const x=event.clientX-rect.left;const y=event.clientY-rect.top;if(x<0||y<0||x>width||y>height)return;if(ripples.length>2)ripples.shift();ripples.push({x,y,r:0});}build();readColors();// Paint once synchronously — rAF never fires in a throttled tab, and a
// blank Bonjour is worse than a still one. In a static context this
// single paint is also the whole picture: no rAF loop is started below.
paint();// Debounced so a container inside an animated/elastic layout (CSS
// transition, sidebar toggle, orientation change) can't trigger a
// burst of full rebuilds — each one re-rasterizes the text and scans
// every pixel for ink.
let resizeTimer=0;const observer=new ResizeObserver(()=>{window.clearTimeout(resizeTimer);resizeTimer=window.setTimeout(()=>{build();paint();},RESIZE_DEBOUNCE_MS);});observer.observe(host);// Off-screen or backgrounded: skip simulate/paint entirely rather
// than spending every frame animating something nobody can see.
const intersectionObserver=typeof IntersectionObserver!=="undefined"?new IntersectionObserver(entries=>{paused=!entries[0]?.isIntersecting;},{threshold:0}):null;intersectionObserver?.observe(host);function onVisibilityChange(){if(document.hidden){paused=true;}else if(!intersectionObserver||host.getBoundingClientRect().bottom>0){// rAF already self-pauses in hidden tabs, so this mainly
// covers browsers without reliable IntersectionObserver
// support; re-check intersection on foregrounding.
paused=false;}}document.addEventListener("visibilitychange",onVisibilityChange);// Webfonts arrive after first paint, and a Framer font picked in the
// panel may land later still — so rebuild on both signals, not just
// the one-shot ready promise.
let disposed=false;const fonts=typeof document!=="undefined"?document.fonts:null;const onFonts=()=>{if(disposed)return;build();paint();};if(fonts){fonts.ready.then(onFonts);fonts.addEventListener?.("loadingdone",onFonts);}// Continuous simulation/animation only ever starts here — never in a
// static context (Framer canvas or export/thumbnail rendering) and
// never when the visitor has asked for reduced motion. Both of those
// cases stop after the single synchronous paint() above.
if(!still){window.addEventListener("pointermove",onPointerMove,{passive:true});window.addEventListener("pointerdown",onPointerDown,{passive:true});host.addEventListener("pointerleave",onPointerLeave);raf=requestAnimationFrame(loop);}return()=>{observer.disconnect();intersectionObserver?.disconnect();document.removeEventListener("visibilitychange",onVisibilityChange);window.clearTimeout(resizeTimer);disposed=true;fonts?.removeEventListener?.("loadingdone",onFonts);if(raf)cancelAnimationFrame(raf);window.removeEventListener("pointermove",onPointerMove);window.removeEventListener("pointerdown",onPointerDown);host.removeEventListener("pointerleave",onPointerLeave);};},[text,fontKey,fit,dotSize,dotGap,radius,strength,stiffness,damping,bleed,breathe,accent,accentValue,base,isStatic]);const hostStyle={position:"relative",width:"100%",height:"100%",overflow:"visible",...style};hostStyle["--sg-accent"]=accentValue;// The word is painted to canvas, which is invisible to crawlers and screen
// readers — so it is also emitted as real text in the chosen tag, clipped
// out of sight. Assistive tech and search engines read this; the canvas is
// decorative and hidden from the accessibility tree.
const Tag=tag||"h2";return /*#__PURE__*/_jsxs("div",{ref:hostRef,style:hostStyle,children:[/*#__PURE__*/_jsx(Tag,{style:srOnly,children:text}),/*#__PURE__*/_jsx("span",{ref:fontProbe,"aria-hidden":"true",style:{...srOnly,...font},children:text}),/*#__PURE__*/_jsx("span",{ref:baseProbe,style:{position:"absolute",width:0,height:0,visibility:"hidden",color:`var(--framer-color-text, ${base})`}}),/*#__PURE__*/_jsx("span",{ref:accentProbe,style:{position:"absolute",width:0,height:0,visibility:"hidden",color:"var(--sg-accent)"}}),/*#__PURE__*/_jsx("canvas",{ref:canvasRef,"aria-hidden":"true",style:{display:"block",position:"absolute",// Sized and offset in build(); the bleed area must not
// swallow clicks meant for whatever sits beside it.
pointerEvents:"none"}})]});}addPropertyControls(ScatterGrid,{text:{type:ControlType.String,title:"Text",defaultValue:"Bonjour"},tag:{type:ControlType.Enum,title:"Tag",options:["h1","h2","h3","h4","p"],optionTitles:["H1","H2","H3","H4","Paragraph"],defaultValue:"h2"},font:{type:ControlType.Font,title:"Font",// "extended" opens Framer's full font picker — every family in the
// library, plus weight, size, tracking and line height.
controls:"extended",defaultFontType:"sans-serif",defaultValue:{fontSize:200,variant:"Bold",letterSpacing:"-0.04em",lineHeight:"1em"}},fit:{type:ControlType.Boolean,title:"Fit width",defaultValue:true,enabledTitle:"Fill",disabledTitle:"Exact"},dotSize:{type:ControlType.Number,title:"Dot",min:2,max:14,step:1,defaultValue:4,unit:"px"},dotGap:{type:ControlType.Number,title:"Gap",min:0,max:14,step:1,defaultValue:1,unit:"px"},radius:{type:ControlType.Number,title:"Reach",min:40,max:320,step:10,defaultValue:150,unit:"px"},strength:{type:ControlType.Number,title:"Push",min:0,max:6,step:.1,defaultValue:1.8},stiffness:{type:ControlType.Number,title:"Return",min:.01,max:.2,step:.005,defaultValue:.01},damping:{type:ControlType.Number,title:"Damping",min:.7,max:.97,step:.01,defaultValue:.86},bleed:{type:ControlType.Number,title:"Bleed",min:0,max:300,step:10,defaultValue:0,unit:"px"},breathe:{type:ControlType.Boolean,title:"Idle wave",defaultValue:true},accent:{type:ControlType.Color,title:"Accent",defaultValue:"rgb(198, 237, 43)"},base:{type:ControlType.Color,title:"Base",defaultValue:"rgb(13, 13, 13)",description:"Get more components from [Framerstacks](https://www.framerstacks.com/)"}});
export const __FramerMetadata__ = {"exports":{"default":{"type":"reactComponent","name":"ScatterGrid","slots":[],"annotations":{"framerDisableUnlink":"","framerContractVersion":"1","framerIntrinsicHeight":"220","framerSupportedLayoutWidth":"any","framerIntrinsicWidth":"700","framerSupportedLayoutHeight":"any"}},"__FramerMetadata__":{"type":"variable"}}}
//# sourceMappingURL=./ScatterGrid.map