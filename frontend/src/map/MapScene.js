// Escena Pixi del mapa de la liga: continente, ciudades, ubicacion del equipo y las animaciones del
// dia de partido (vuelo entre ciudades o "Play Ball" en la misma). Independiente de React: la crean
// LeagueMap y TravelOverlay en un div y la destruyen al desmontar.
import * as PIXI from 'pixi.js';
import { clamp, ease, lerp } from '../stadium/geometry.js';
import {
  WORLD, coastline, curveAngle, curvePoint, flightCurve, scenery, teamHex,
} from './geometry.js';

const SEA = 0x1d4e73;
const SAND = 0xd9c48f;
const LAND = 0x4f8a4c;
const GOLD = 0xfbbf24;
const TEXT_RES = 3; // los textos se rasterizan a mayor resolucion para aguantar el zoom

// destroy tolerante: la escena puede destruirse a mitad de una animacion
const kill = (o) => { if (o && !o.destroyed) o.destroy(); };
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeOutBack = (k) => 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2);

function label(text, size, fill = 0xffffff) {
  const t = new PIXI.Text(text, {
    fontFamily: 'system-ui, sans-serif',
    fontSize: size,
    fontWeight: '800',
    fill,
    stroke: 0x10202e,
    strokeThickness: Math.max(3, size / 5),
    lineJoin: 'round',
  });
  t.resolution = TEXT_RES;
  t.anchor.set(0.5, 0);
  return t;
}

function drawPlane(g, color, alpha = 1) {
  g.beginFill(color, alpha);
  g.drawEllipse(0, 0, 30, 6.5); // fuselaje
  g.drawPolygon([6, -4, -6, -32, -14, -32, -6, 0, -14, 32, -6, 32, 6, 4]); // alas
  g.drawPolygon([-22, -2, -30, -13, -35, -13, -31, 0, -35, 13, -30, 13, -22, 2]); // cola
  g.endFill();
}

function drawBaseball(g) {
  g.lineStyle(2, 0xd1d5db, 1);
  g.beginFill(0xffffff);
  g.drawCircle(0, 0, 30);
  g.endFill();
  g.lineStyle(3, 0xdc2626, 1);
  g.arc(-44, 0, 30, -0.75, 0.75);
  g.arc(44, 0, 30, Math.PI - 0.75, Math.PI + 0.75);
  g.lineStyle(0);
}

export default class MapScene {
  constructor(el, { interactive = false, onSelect } = {}) {
    this.el = el;
    this.onSelect = onSelect;
    this.interactive = interactive;
    this.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.tweens = [];
    this.skipping = false;
    this.destroyed = false;
    this.cities = new Map(); // id -> { node, pos, team }
    this.cam = { x: WORLD.cx, y: WORLD.cy, z: 1 };
    this.fitZ = 1;
    this.time = 0;
    this.data = null;

    this.app = new PIXI.Application({
      resizeTo: el,
      antialias: true,
      backgroundColor: SEA,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
    });
    el.appendChild(this.app.view);

    this.world = new PIXI.Container();
    this.hud = new PIXI.Container(); // coordenadas de pantalla (textos grandes de las animaciones)
    this.app.stage.addChild(this.world, this.hud);
    this.layers = {};
    ['base', 'route', 'cities', 'marker', 'fx'].forEach((n) => {
      this.layers[n] = new PIXI.Container();
      this.world.addChild(this.layers[n]);
    });
    this.routeG = new PIXI.Graphics();
    this.layers.route.addChild(this.routeG);

    this.drawBase();
    this.marker = this.buildMarker();
    this.layers.marker.addChild(this.marker);
    this.marker.visible = false;

    this.measure();
    this.fitView(true);

    this.loop = this.loop.bind(this);
    this.app.ticker.add(this.loop);
    this.onResize = () => {
      const keepFit = Math.abs(this.cam.z - this.fitZ) < 1e-3;
      this.measure();
      if (keepFit) this.fitView(true);
    };
    this.app.renderer.on('resize', this.onResize);
    if (interactive) this.bindPanZoom();
  }

  // ---------- base ----------
  drawBase() {
    const g = new PIXI.Graphics();
    // olas decorativas sobre el mar
    g.lineStyle(2, 0xffffff, 0.08);
    for (let y = -300; y < WORLD.h + 300; y += 70) {
      for (let x = -400 + ((y / 70) % 2) * 60; x < WORLD.w + 400; x += 120) {
        g.moveTo(x, y);
        g.quadraticCurveTo(x + 12, y - 8, x + 24, y);
        g.quadraticCurveTo(x + 36, y + 8, x + 48, y);
      }
    }
    g.lineStyle(0);
    g.beginFill(0xffffff, 0.06);
    g.drawPolygon(coastline(220, 1.07));
    g.endFill();
    g.beginFill(SAND);
    g.drawPolygon(coastline(220, 1.025));
    g.endFill();
    g.beginFill(LAND);
    g.drawPolygon(coastline(220, 1));
    g.endFill();

    for (const s of scenery()) {
      if (s.kind === 'lake') {
        g.beginFill(0x3b82b5, 0.85);
        g.drawEllipse(s.x, s.y, 26 * s.s, 15 * s.s);
        g.endFill();
      } else if (s.kind === 'hill') {
        g.beginFill(0x3d6f3b);
        g.drawPolygon([s.x - 22 * s.s, s.y + 10, s.x, s.y - 20 * s.s, s.x + 22 * s.s, s.y + 10]);
        g.endFill();
        g.beginFill(0xe5e7eb, 0.8);
        g.drawPolygon([s.x - 6 * s.s, s.y - 12 * s.s, s.x, s.y - 20 * s.s, s.x + 6 * s.s, s.y - 12 * s.s]);
        g.endFill();
      } else {
        g.beginFill(0x2f5e32);
        g.drawCircle(s.x, s.y, 8 * s.s);
        g.drawCircle(s.x + 9 * s.s, s.y + 4, 7 * s.s);
        g.endFill();
      }
    }
    this.layers.base.addChild(g);
  }

  buildMarker() {
    const c = new PIXI.Container();
    const ring = new PIXI.Graphics();
    ring.lineStyle(4, GOLD, 1);
    ring.drawCircle(0, 0, 30);
    c.addChild(ring);
    c.ring = ring;
    const tag = label('Estás aquí', 15, GOLD);
    tag.anchor.set(0.5, 1);
    tag.y = -34;
    c.addChild(tag);
    return c;
  }

  // ---------- datos ----------
  // { teams, positions: Map(id -> {x,y}), userTeamId, currentCityTeamId, nextGame, selectedId }
  setData(data) {
    this.data = data;
    this.layers.cities.removeChildren().forEach((o) => o.destroy({ children: true }));
    this.cities.clear();

    for (const team of data.teams) {
      const pos = data.positions.get(team.id);
      if (!pos) continue;
      const node = new PIXI.Container();
      node.position.set(pos.x, pos.y);
      const isUser = team.id === data.userTeamId;
      const g = new PIXI.Graphics();
      if (team.id === data.selectedId) {
        g.beginFill(0xffffff, 0.25);
        g.drawCircle(0, 0, 26);
        g.endFill();
      }
      g.lineStyle(isUser ? 4 : 3, isUser ? GOLD : 0xffffff, 1);
      g.beginFill(teamHex(team.name));
      g.drawCircle(0, 0, isUser ? 15 : 12);
      g.endFill();
      g.lineStyle(0);
      g.beginFill(0xffffff, 0.9);
      g.drawCircle(0, 0, 4);
      g.endFill();
      node.addChild(g);
      const name = label(team.city, isUser ? 20 : 17, isUser ? GOLD : 0xffffff);
      name.y = 18;
      node.addChild(name);

      if (this.onSelect) {
        node.eventMode = 'static';
        node.cursor = 'pointer';
        node.hitArea = new PIXI.Circle(0, 10, 34);
        node.on('pointertap', () => {
          if (!this.dragMoved) this.onSelect(team.id);
        });
      }
      this.layers.cities.addChild(node);
      this.cities.set(team.id, { node, pos, team });
    }

    const here = this.cities.get(data.currentCityTeamId);
    this.marker.visible = !!here;
    if (here) this.marker.position.set(here.pos.x, here.pos.y);
    this.drawRoute();
  }

  // Ruta discontinua de la ubicacion actual al proximo partido (vista del mapa)
  drawRoute() {
    const g = this.routeG;
    g.clear();
    const d = this.data;
    if (!d?.nextGame) return;
    const from = this.cities.get(d.currentCityTeamId)?.pos;
    const to = this.cities.get(d.nextGame.home_team_id)?.pos;
    if (!from || !to || from === to) return;
    this.dashCurve(g, flightCurve(from, to), 1, 0xffffff, 0.85);
  }

  dashCurve(g, curve, upTo, color, alpha) {
    const steps = 60;
    const n = Math.max(1, Math.floor(steps * upTo));
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const p0 = curvePoint(curve, i / steps);
      const p1 = curvePoint(curve, Math.min(upTo, (i + 1) / steps));
      g.lineStyle(4, color, alpha);
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);
    }
    g.lineStyle(0);
  }

  // ---------- camara ----------
  measure() {
    this.W = this.app.screen.width;
    this.H = this.app.screen.height;
    this.fitZ = Math.min(this.W / (WORLD.w + 40), this.H / (WORLD.h + 40));
  }

  applyCam() {
    const { x, y, z } = this.cam;
    this.world.scale.set(z);
    this.world.position.set(this.W / 2 - x * z, this.H / 2 - y * z);
  }

  fitView(instant = false) {
    const target = { x: WORLD.cx, y: WORLD.cy, z: this.fitZ };
    if (instant) {
      this.cam = target;
      this.applyCam();
      return Promise.resolve();
    }
    return this.moveCam(target, 0.6);
  }

  zoomBy(f) {
    this.cam.z = clamp(this.cam.z * f, this.fitZ * 0.8, this.fitZ * 4);
    this.applyCam();
  }

  moveCam(target, dur) {
    const from = { ...this.cam };
    return this.tween(dur, (k) => {
      const e = ease(k);
      this.cam = { x: lerp(from.x, target.x, e), y: lerp(from.y, target.y, e), z: lerp(from.z, target.z, e) };
      this.applyCam();
    });
  }

  bindPanZoom() {
    const view = this.app.view;
    let last = null;
    this.onWheel = (e) => {
      e.preventDefault();
      this.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    this.onDown = (e) => {
      last = { x: e.clientX, y: e.clientY };
      this.dragMoved = false;
    };
    this.onMove = (e) => {
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.dragMoved = true;
      last = { x: e.clientX, y: e.clientY };
      this.cam.x -= dx / this.cam.z;
      this.cam.y -= dy / this.cam.z;
      this.applyCam();
    };
    this.onUp = () => {
      last = null;
    };
    view.addEventListener('wheel', this.onWheel, { passive: false });
    view.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
  }

  // ---------- tweens ----------
  tween(dur, update) {
    if (this.destroyed) return Promise.resolve();
    const d = this.reduced ? dur * 0.3 : dur;
    if (this.skipping || d <= 0) {
      update(1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.tweens.push({ t: 0, dur: d, update, resolve });
    });
  }

  wait(dur) {
    return this.tween(dur, () => {});
  }

  // Termina al instante la animacion en curso (boton "Saltar")
  skip() {
    this.skipping = true;
    const pending = this.tweens;
    this.tweens = [];
    pending.forEach((tw) => {
      tw.update(1);
      tw.resolve();
    });
  }

  loop() {
    const dt = Math.min(0.05, this.app.ticker.deltaMS / 1000);
    this.time += dt;
    if (this.marker.visible) {
      const p = (this.time % 1.4) / 1.4;
      this.marker.ring.scale.set(0.7 + p * 0.6);
      this.marker.ring.alpha = 1 - p;
    }
    if (!this.tweens.length) return;
    const active = this.tweens;
    this.tweens = [];
    for (const tw of active) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.update(k);
      if (k >= 1) tw.resolve();
      else this.tweens.push(tw);
    }
  }

  // ---------- animaciones ----------
  burst(x, y, color, count = 28) {
    const parts = [];
    for (let i = 0; i < count; i++) {
      const p = new PIXI.Graphics();
      p.beginFill(i % 3 === 0 ? GOLD : i % 3 === 1 ? 0xffffff : color);
      p.drawRect(-4, -2, 8, 4);
      p.endFill();
      p.position.set(x, y);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const v = 120 + Math.random() * 160;
      parts.push({ p, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, spin: Math.random() * 8 - 4 });
      this.layers.fx.addChild(p);
    }
    return this.tween(1.3, (k) => {
      const t = k * 1.3;
      for (const q of parts) {
        q.p.position.set(x + q.vx * t, y + q.vy * t + 260 * t * t);
        q.p.rotation = q.spin * t;
        q.p.alpha = 1 - k;
      }
    }).then(() => parts.forEach((q) => kill(q.p)));
  }

  ripple(x, y, color) {
    const g = new PIXI.Graphics();
    this.layers.fx.addChild(g);
    return this.tween(0.9, (k) => {
      g.clear();
      g.lineStyle(5 * (1 - k) + 1, color, 1 - k);
      g.drawCircle(x, y, 20 + 70 * easeOut(k));
    }).then(() => kill(g));
  }

  // Vuelo de la ciudad actual a la del partido. Resuelve al aterrizar.
  async playFlight(fromId, toId) {
    this.skipping = false;
    const from = this.cities.get(fromId)?.pos;
    const to = this.cities.get(toId)?.pos;
    if (!from || !to) return;
    this.routeG.clear();
    this.marker.visible = false;
    const curve = flightCurve(from, to);

    // encuadre del trayecto completo
    const xs = [from.x, to.x, curve.c.x];
    const ys = [from.y, to.y, curve.c.y];
    const bw = Math.max(...xs) - Math.min(...xs) + 360;
    const bh = Math.max(...ys) - Math.min(...ys) + 300;
    const z = clamp(Math.min(this.W / bw, this.H / bh), this.fitZ, this.fitZ * 2.2);
    await this.moveCam({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, z }, 0.8);
    if (this.destroyed) return;

    const trail = new PIXI.Graphics();
    const shadow = new PIXI.Graphics();
    drawPlane(shadow, 0x000000, 0.28);
    const plane = new PIXI.Graphics();
    drawPlane(plane, 0xffffff);
    plane.beginFill(0x2563eb);
    plane.drawRect(-18, -2, 34, 4);
    plane.endFill();
    this.layers.fx.addChild(trail, shadow, plane);
    this.ripple(from.x, from.y, 0xffffff);

    await this.tween(3.6, (k) => {
      const e = ease(k);
      const p = curvePoint(curve, e);
      const ang = curveAngle(curve, Math.max(0.001, Math.min(0.999, e)));
      // altitud: despega en el primer 18%, aterriza en el ultimo 18%
      const alt = Math.min(1, k / 0.18, (1 - k) / 0.18);
      plane.position.set(p.x, p.y - alt * 14);
      plane.rotation = ang;
      plane.scale.set(0.75 + alt * 0.45);
      shadow.position.set(p.x + alt * 22, p.y + alt * 26);
      shadow.rotation = ang;
      shadow.scale.set(0.75 + alt * 0.25);
      trail.clear();
      this.dashCurve(trail, curve, e, 0xffffff, 0.9);
    });

    if (this.destroyed) return;
    this.marker.position.set(to.x, to.y);
    this.marker.visible = true;
    await Promise.all([
      this.ripple(to.x, to.y, GOLD),
      this.tween(0.4, (k) => {
        plane.alpha = 1 - k;
        shadow.alpha = 1 - k;
      }),
    ]);
    kill(plane);
    kill(shadow);
    if (!this.destroyed) this.dashCurve(this.routeG, curve, 1, 0xffffff, 0.55);
    kill(trail);
  }

  // Partido en la ciudad donde ya esta el equipo: zoom a la ciudad y "PLAY BALL!"
  async playPlayBall(cityId) {
    this.skipping = false;
    const city = this.cities.get(cityId);
    if (!city) return;
    const { x, y } = city.pos;
    this.routeG.clear();
    await this.moveCam({ x, y: y - 30, z: this.fitZ * 2.6 }, 1);
    if (this.destroyed) return;

    const ball = new PIXI.Graphics();
    drawBaseball(ball);
    this.layers.fx.addChild(ball);
    const title = label('PLAY BALL!', 72, GOLD);
    title.anchor.set(0.5);
    title.position.set(this.W / 2, this.H * 0.22);
    title.scale.set(0);
    this.hud.addChild(title);

    // la pelota cae y rebota sobre la ciudad mientras gira
    await this.tween(1.2, (k) => {
      const bounce = Math.abs(Math.cos(k * Math.PI * 2.5)) * (1 - k) ** 1.6;
      ball.position.set(x, y - 12 - bounce * 180);
      ball.rotation = k * Math.PI * 4;
      ball.scale.set(0.55);
    });
    if (this.destroyed) return;
    this.ripple(x, y, GOLD);
    this.burst(x, y - 12, teamHex(city.team.name));
    await this.tween(0.6, (k) => {
      title.scale.set(Math.max(0, easeOutBack(k)));
    });
    await this.wait(0.9);
    await this.tween(0.4, (k) => {
      ball.alpha = 1 - k;
    });
    kill(ball);
  }

  destroy() {
    this.destroyed = true;
    this.skip();
    this.app.ticker.remove(this.loop);
    this.app.renderer.off('resize', this.onResize);
    if (this.onWheel) {
      this.app.view.removeEventListener('wheel', this.onWheel);
      this.app.view.removeEventListener('pointerdown', this.onDown);
      window.removeEventListener('pointermove', this.onMove);
      window.removeEventListener('pointerup', this.onUp);
    }
    this.app.destroy(true, { children: true });
  }
}
