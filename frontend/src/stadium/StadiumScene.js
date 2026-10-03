// Escena Pixi de la vista cenital: camara, ciclo dia/noche, sombras y animacion de obra.
// Independiente de React: StadiumView la crea en un div y la destruye al desmontar.
import * as PIXI from 'pixi.js';
import { BUILD, LAYER_OF, ORDER, SIGNATURE, TEAM } from './builders.js';
import { BAND, FRAME, clamp, framePoly, ease, flat, lerp, mixColor, polyline, sstep } from './geometry.js';

const KF = [
  [0, 0x050a22, 0.62], [5, 0x050a22, 0.6], [6.5, 0xff9966, 0.16], [8, 0xffffff, 0], [16, 0xffffff, 0],
  [17.5, 0xff8a50, 0.18], [19, 0x1a1240, 0.46], [20.5, 0x050a22, 0.6], [24, 0x050a22, 0.62],
];
function tintAt(h) {
  for (let i = 0; i < KF.length - 1; i++) {
    const a = KF[i];
    const b = KF[i + 1];
    if (h >= a[0] && h <= b[0]) {
      const k = (h - a[0]) / (b[0] - a[0]);
      return { c: mixColor(a[1], b[1], k), a: lerp(a[2], b[2], k) };
    }
  }
  return { c: 0x050a22, a: 0.6 };
}
function computeEnv(h) {
  const tint = tintAt(h);
  const lf = clamp((tint.a - 0.12) / 0.46, 0, 1);
  const sun = sstep(5.8, 7.2, h) * (1 - sstep(16.8, 18.2, h));
  const p = clamp((h - 6) / 12, 0, 1);
  const elev = ((18 + 52 * Math.sin(Math.PI * p)) * Math.PI) / 180;
  const L = Math.min(2.4, 1 / Math.tan(elev));
  return { hour: h, tint, lf, sun, sx: -Math.cos(Math.PI * p) * L * 0.6, sy: -Math.sin(Math.PI * p) * L * 0.6 };
}
export const hourName = (h) =>
  h < 5.8 || h >= 19.5 ? 'Noche' : h < 9 ? 'Mañana' : h < 15.5 ? 'Mediodía' : h < 18.5 ? 'Tarde' : 'Atardecer';

function dashedLine(g, x0, y0, x1, y1, dash) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / dash));
  for (let i = 0; i < n; i++) {
    g.lineStyle(5, i % 2 ? 0x14171d : 0xffc83d, 1);
    g.moveTo(lerp(x0, x1, i / n), lerp(y0, y1, i / n));
    g.lineTo(lerp(x0, x1, (i + 1) / n), lerp(y0, y1, (i + 1) / n));
  }
}
function scaffoldGraphic(rects) {
  const g = new PIXI.Graphics();
  for (const r of rects) {
    g.beginFill(0xffc83d, 0.1);
    g.drawRect(r.x, r.y, r.w, r.h);
    g.endFill();
    dashedLine(g, r.x, r.y, r.x + r.w, r.y, 16);
    dashedLine(g, r.x + r.w, r.y, r.x + r.w, r.y + r.h, 16);
    dashedLine(g, r.x + r.w, r.y + r.h, r.x, r.y + r.h, 16);
    dashedLine(g, r.x, r.y + r.h, r.x, r.y, 16);
  }
  g.lineStyle(0);
  return g;
}

export default class StadiumScene {
  constructor(el, state, { onHourChange } = {}) {
    this.el = el;
    this.onHourChange = onHourChange;
    this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.dirty = true;
    this.W = 800;
    this.H = 600;
    this.fitZ = 1;
    this.shadowsOn = true;
    this.playing = false;
    this.hour = 14;
    this.busy = false;
    this.pending = null;
    this.rendered = {};
    this.sigs = {};
    this.tweens = [];
    this.cam = { x: FRAME.cx, y: FRAME.cy, z: 1 };
    this.pointers = new Map();
    this.lastDist = 0;
    this.tickAcc = 0;

    this.app = new PIXI.Application({
      resizeTo: el,
      antialias: true,
      backgroundColor: 0x151a24,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    el.appendChild(this.app.view);
    this.app.ticker.remove(this.app.render, this.app); // render bajo demanda: solo dibuja si hay cambios

    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);
    this.layers = {};
    ['ground', 'shadow', 'wall', 'stands', 'standShadow', 'board', 'lights', 'night', 'top', 'fx'].forEach((n) => {
      this.layers[n] = new PIXI.Container();
      this.world.addChild(this.layers[n]);
    });
    this.shadowG = new PIXI.Graphics();
    this.shadowFilter = new PIXI.AlphaFilter(0.35);
    this.layers.shadow.addChild(this.shadowG);
    this.layers.shadow.filters = [this.shadowFilter];
    // sombras de las plantas exteriores sobre las interiores: un grupo por limite, recortado con una
    // mascara al anillo de gradas de adentro (asi no oscurece el campo ni la propia porcion)
    this.standShadowFilter = new PIXI.AlphaFilter(0.35);
    this.layers.standShadow.filters = [this.standShadowFilter];
    this.standShadowGroups = new Map();
    this.nightG = new PIXI.Graphics();
    this.layers.night.addChild(this.nightG);

    this.state = state;
    this.mountAll();
    this.measure();
    this.fitView();
    this.setHour(14);

    this.loop = this.loop.bind(this);
    this.app.ticker.add(this.loop);
    this.onResize = () => {
      this.measure();
      this.applyCam();
    };
    this.app.renderer.on('resize', this.onResize);
    this.bindInput();
  }

  // ---------- camara ----------
  applyCam() {
    this.world.scale.set(this.cam.z);
    this.world.position.set(this.W / 2 - this.cam.x * this.cam.z, this.H / 2 - this.cam.y * this.cam.z);
    this.dirty = true;
  }
  // el encuadre crece con las plantas del bowl (+ margen para torres y edificio medico)
  measure() {
    this.W = this.app.screen.width;
    this.H = this.app.screen.height;
    const extra = (this.state?.floors ?? 1) * BAND + 150;
    this.fitZ = Math.min(this.W / (2 * (FRAME.a + extra)), this.H / (2 * (FRAME.b + extra))) * 0.97;
  }
  fitView() {
    this.cam.x = FRAME.cx;
    this.cam.y = FRAME.cy;
    this.cam.z = this.fitZ;
    this.applyCam();
  }
  zoomAt(px, py, nz) {
    const { cam, W, H } = this;
    nz = clamp(nz, this.fitZ * 0.7, 4);
    const wx = cam.x + (px - W / 2) / cam.z;
    const wy = cam.y + (py - H / 2) / cam.z;
    cam.z = nz;
    cam.x = wx - (px - W / 2) / cam.z;
    cam.y = wy - (py - H / 2) / cam.z;
    this.applyCam();
  }
  zoomBy(f) {
    this.zoomAt(this.W / 2, this.H / 2, this.cam.z * f);
  }

  // ---------- tweens ----------
  tween(dur, fn, done) {
    this.tweens.push({ t: 0, dur: Math.max(0.001, dur), fn, done });
    this.dirty = true;
  }
  tweenCam(to, dur, done) {
    const f = { ...this.cam };
    this.tween(this.reduced ? 0.01 : dur, (k) => {
      const e = ease(k);
      this.cam.x = lerp(f.x, to.x, e);
      this.cam.y = lerp(f.y, to.y, e);
      this.cam.z = lerp(f.z, to.z, e);
      this.applyCam();
    }, done);
  }

  // ---------- tiempo, luz y sombras ----------
  redrawShadows() {
    const { shadowG, env } = this;
    shadowG.clear();
    this.standShadowGroups.forEach(({ g }) => g.clear());
    if (!this.shadowsOn || env.sun < 0.02) {
      this.layers.shadow.visible = false;
      this.layers.standShadow.visible = false;
      this.dirty = true;
      return;
    }
    this.layers.shadow.visible = true;
    this.layers.standShadow.visible = true;
    this.shadowFilter.alpha = 0.36 * env.sun;
    this.standShadowFilter.alpha = 0.3 * env.sun;
    const all = [];
    Object.values(this.rendered).forEach((b) => b.shadows && all.push(...b.shadows));
    const off = (pts, f) => pts.map((p) => ({ x: p.x + env.sx * f, y: p.y + env.sy * f }));
    for (const s of all) {
      if (!s.onStands) continue;
      const { g } = this.standShadowGroup(s.onStands);
      g.beginFill(0x000000, 1);
      for (const f of [0, 0.33, 0.66, 1]) g.drawPolygon(flat(off(s.pts, s.h * f)));
      g.endFill();
    }
    shadowG.beginFill(0x000000, 1);
    for (const s of all) {
      if (s.type !== 'poly' || s.onStands) continue;
      const copies = s.solid ? [0, 0.33, 0.66, 1] : [1];
      for (const f of copies) shadowG.drawPolygon(flat(off(s.pts, s.h * f)));
    }
    shadowG.endFill();
    for (const s of all) {
      if (s.type === 'line') {
        shadowG.lineStyle(s.w, 0x000000, 1);
        polyline(shadowG, off(s.pts, s.h));
      } else if (s.type === 'pole') {
        const ex = s.x + env.sx * s.h;
        const ey = s.y + env.sy * s.h;
        shadowG.lineStyle(s.w, 0x000000, 1);
        shadowG.moveTo(s.x, s.y);
        shadowG.lineTo(ex, ey);
        if (s.head) {
          shadowG.lineStyle(18, 0x000000, 1);
          shadowG.moveTo(lerp(s.x, ex, 0.88), lerp(s.y, ey, 0.88));
          shadowG.lineTo(ex, ey);
        }
      }
    }
    shadowG.lineStyle(0);
    this.dirty = true;
  }
  // Grupo de sombras sobre las gradas que quedan por dentro de `inner` (offset del marco)
  standShadowGroup(inner) {
    let group = this.standShadowGroups.get(inner);
    if (!group) {
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawPolygon(flat(framePoly(inner)));
      mask.beginHole();
      mask.drawPolygon(flat(framePoly(0)));
      mask.endHole();
      mask.endFill();
      const g = new PIXI.Graphics();
      g.mask = mask;
      this.layers.standShadow.addChild(mask, g);
      group = { g, mask };
      this.standShadowGroups.set(inner, group);
    }
    return group;
  }

  setHour(h) {
    this.hour = h;
    this.env = computeEnv(h);
    this.nightG.clear();
    if (this.env.tint.a > 0.005) {
      this.nightG.beginFill(this.env.tint.c, this.env.tint.a);
      this.nightG.drawRect(-2600, -2600, 5200, 5200);
      this.nightG.endFill();
    }
    Object.values(this.rendered).forEach((b) => b.update && b.update(this.env));
    this.redrawShadows();
    this.onHourChange?.(h);
    this.dirty = true;
  }
  setPlaying(p) {
    this.playing = p;
  }
  setShadows(on) {
    this.shadowsOn = on;
    this.redrawShadows();
  }

  // ---------- montaje de partes ----------
  attach(key, b) {
    this.layers[LAYER_OF[key]].addChild(b.body);
    if (b.over) this.layers.wall.addChild(b.over);
    if (b.top) this.layers.top.addChild(b.top);
    if (b.update && this.env) b.update(this.env);
  }
  detach(b) {
    [b.body, b.over, b.top].forEach((o) => o && o.destroy({ children: true }));
  }
  setAlpha(b, a) {
    [b.body, b.over, b.top].forEach((o) => { if (o) o.alpha = a; });
  }
  mountAll() {
    for (const key of ORDER) {
      this.rendered[key] = BUILD[key](this.state);
      this.sigs[key] = SIGNATURE[key](this.state);
      this.attach(key, this.rendered[key]);
    }
    this.dirty = true;
  }

  // Aplica un nuevo estado sin animacion, reconstruyendo solo las partes que cambiaron.
  // Si hay una obra en curso, se aplica al terminar.
  setState(state) {
    if (this.busy) {
      this.pending = state;
      return;
    }
    const floorsChanged = state.floors !== this.state?.floors;
    this.state = state;
    if (floorsChanged) {
      this.measure();
      this.fitView();
    }
    let changed = false;
    for (const key of ORDER) {
      const sig = SIGNATURE[key](state);
      if (sig === this.sigs[key]) continue;
      const nb = BUILD[key](state);
      this.detach(this.rendered[key]);
      this.attach(key, nb);
      this.rendered[key] = nb;
      this.sigs[key] = sig;
      changed = true;
    }
    if (changed && this.env) this.redrawShadows();
  }

  // ---------- mejora animada ----------
  puff(x, y) {
    const g = new PIXI.Graphics();
    g.beginFill(0xd8c7a3, 0.55);
    g.drawCircle(0, 0, 8);
    g.endFill();
    g.position.set(x, y);
    this.layers.fx.addChild(g);
    this.tween(0.9, (k) => {
      g.scale.set(0.6 + k * 2.2);
      g.alpha = 0.55 * (1 - k);
      g.y = y - 26 * k;
    }, () => g.destroy());
  }
  ring(x, y) {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    this.layers.fx.addChild(g);
    this.tween(0.8, (k) => {
      g.clear();
      g.lineStyle(5, TEAM.accent, 1 - k);
      g.drawCircle(0, 0, 20 + 260 * ease(k));
    }, () => g.destroy());
  }

  // Anima la obra de `key` hasta el estado `state`. Resuelve cuando termina.
  playUpgrade(key, state) {
    return new Promise((resolve) => {
      if (this.busy || this.destroyed) {
        this.setState(state);
        resolve();
        return;
      }
      const sig = SIGNATURE[key](state);
      if (sig === this.sigs[key]) {
        this.setState(state);
        resolve();
        return;
      }
      this.busy = true;
      const nb = BUILD[key](state);
      this.attach(key, nb);
      this.setAlpha(nb, 0);
      const old = this.rendered[key];
      let rects = nb.scaffold;
      if (!rects) {
        const b = nb.body.getLocalBounds();
        rects = [{ x: b.x - 10, y: b.y - 10, w: b.width + 20, h: b.height + 20 }];
      }
      const sc = scaffoldGraphic(rects);
      this.layers.fx.addChild(sc);
      const dur = this.reduced ? 0.3 : 1.6;
      const saved = { ...this.cam };
      if (!this.reduced) this.tweenCam({ x: nb.focus.x, y: nb.focus.y, z: this.fitZ * nb.focus.z }, 0.7);
      let acc = 0;
      this.tween(dur, (k, dt) => {
        sc.alpha = 0.6 + 0.4 * Math.sin(k * 14);
        acc += dt;
        if (!this.reduced && acc > 0.07) {
          acc = 0;
          const r = rects[Math.floor(Math.random() * rects.length)];
          this.puff(r.x + Math.random() * r.w, r.y + Math.random() * r.h);
        }
      }, () => {
        sc.destroy();
        this.tween(this.reduced ? 0.01 : 0.8, (k) => {
          this.setAlpha(nb, k);
          if (old) this.setAlpha(old, 1 - k);
        }, () => {
          if (old) this.detach(old);
          this.rendered[key] = nb;
          this.sigs[key] = sig;
          this.busy = false;
          this.redrawShadows();
          this.ring(nb.focus.x, nb.focus.y);
          if (!this.reduced) this.tweenCam(saved, 0.9);
          // aplica el estado completo (y cualquier cambio que llego durante la obra)
          const next = this.pending || state;
          this.pending = null;
          this.setState(next);
          resolve();
        });
      });
    });
  }

  // ---------- bucle principal ----------
  loop() {
    const dt = Math.min(0.05, this.app.ticker.deltaMS / 1000);
    if (this.playing) this.setHour((this.hour + dt * 0.6) % 24);
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k, dt);
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.done && tw.done();
      }
      this.dirty = true;
    }
    this.tickAcc += dt;
    if (this.tickAcc > 0.25) {
      this.tickAcc = 0;
      Object.values(this.rendered).forEach((b) => {
        if (b.tick) {
          b.tick();
          this.dirty = true;
        }
      });
    }
    if (this.dirty) {
      this.dirty = false;
      this.app.renderer.render(this.app.stage);
    }
  }

  // ---------- entrada: arrastrar, rueda, pellizco ----------
  bindInput() {
    const view = this.app.view;
    const posOf = (e) => {
      const r = view.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    view.style.touchAction = 'none';
    view.style.cursor = 'grab';
    view.addEventListener('pointerdown', (e) => {
      view.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, posOf(e));
      view.style.cursor = 'grabbing';
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.lastDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    });
    view.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = posOf(e);
      const prev = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1) {
        this.cam.x -= (p.x - prev.x) / this.cam.z;
        this.cam.y -= (p.y - prev.y) / this.cam.z;
        this.applyCam();
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.lastDist > 0) this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (this.cam.z * d) / this.lastDist);
        this.lastDist = d;
      }
    });
    const endPtr = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.lastDist = 0;
      if (!this.pointers.size) view.style.cursor = 'grab';
    };
    view.addEventListener('pointerup', endPtr);
    view.addEventListener('pointercancel', endPtr);
    view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const p = posOf(e);
      this.zoomAt(p.x, p.y, this.cam.z * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
  }

  destroy() {
    this.destroyed = true;
    this.app.ticker.remove(this.loop);
    this.app.renderer.off('resize', this.onResize);
    // los listeners del canvas se van con el; destroy(true) elimina el canvas del DOM
    this.app.destroy(true, { children: true });
  }
}
