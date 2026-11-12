import { plateBox, plateFontSize, plateText } from '../core/plate';
import type { VehicleKey } from '../core/stack/stack-vehicles';
const VEHICLE_ART_SIZE = {tractor: {w: 457, h: 647}} as const;
import { assetManager, ImageAsset, resources, type SpriteFrame } from 'cc';
import { GAME_TITLE } from '../config/brand';
import {
  STACK_BODY_HOLE,
  STACK_BODY_SIZE,
} from '../core/stack/stack-layout';
import {
  createStackShareCopy,
  createStackHomecomingCopy,
  formatStackShareProvince,
  formatStackShareVehicle,
  STACK_SHARE_LINK,
  STACK_CARGO_POSITIONS,
  STACK_SHARE_HEIGHT,
  STACK_SHARE_ITEM_KEYS,
  STACK_SHARE_WIDTH,
  stackShareFileName,
  type StackShareResult,
} from '../core/stack/stack-share';
import { loadArt } from './OptionalResources';

export interface StackShareRide {
  /** Which rear-view art, for the licence plate position. */
  readonly key?: VehicleKey;
  readonly name: string;
  /** resources path of a non-sedan ride; null keeps the sedan art. */
  readonly art: string | null;
  readonly w: number;
  readonly h: number;
  readonly stretchX?: number;
  readonly region?: {readonly x: number; readonly y: number; readonly w: number; readonly h: number};
}

export interface StackShareScene {
  readonly stage: number;
  /** Overrides “第 N 关”, e.g. “每日一关”. */
  readonly stageLabel?: string;
  readonly result: StackShareResult;
  readonly province?: string | null;
  readonly rank?: number | null;
  /** False for levels/runs the leaderboard does not count. */
  readonly counted?: boolean;
  readonly ride?: StackShareRide;
  /** Level-9 finale card: the home gate, parents and the parked tractor. */
  readonly ending?: boolean;
}

interface FrameDrawable {
  readonly image: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
const gold = '#ffd27a';
const pale = '#fff2cf';

function canUseBrowserCanvas(): boolean {
  return typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
}

function frameDrawable(frame: SpriteFrame | undefined): FrameDrawable | null {
  if (!frame) return null;
  try {
    const texture = frame.texture as { getHtmlElementObj?: () => HTMLCanvasElement | HTMLImageElement | null };
    const image = texture?.getHtmlElementObj?.();
    if (!image) return null;
    const imageWidth = 'naturalWidth' in image
      ? Number((image as HTMLImageElement).naturalWidth)
      : Number((image as HTMLCanvasElement).width);
    const imageHeight = 'naturalHeight' in image
      ? Number((image as HTMLImageElement).naturalHeight)
      : Number((image as HTMLCanvasElement).height);
    const width = Math.max(1, Number(frame.rect?.width) || imageWidth || 1);
    const height = Math.max(1, Number(frame.rect?.height) || imageHeight || 1);
    return {image, width, height};
  } catch {
    return null;
  }
}

/**
 * Cocos may drop an image's DOM element after uploading it to the GPU (for example once the finish
 * view has drawn the same goods), so reload the original file from its URL and only fall back to
 * the cached element when that is impossible.
 */
async function freshDrawable(path: string, frame: SpriteFrame | undefined): Promise<FrameDrawable | null> {
  try {
    const info = resources.getInfoWithPath(path, ImageAsset);
    const url = info
      ? assetManager.utils.getUrlWithUuid(info.uuid, {isNative: true, nativeExt: '.png', bundle: 'resources'} as never)
      : (frame?.texture as {image?: {nativeUrl?: string}} | null)?.image?.nativeUrl;
    if (url && typeof Image !== 'undefined') {
      const image = await new Promise<HTMLImageElement | null>(resolve => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => resolve(null);
        element.src = url;
      });
      if (image && image.naturalWidth > 0) {
        return {image, width: image.naturalWidth, height: image.naturalHeight};
      }
    }
  } catch { /* fall back to the cached element */ }
  return frameDrawable(frame);
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function fillRounded(
  context: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.fillStyle = color;
  roundedRect(context, x, y, width, height, radius);
  context.fill();
}

function fitFont(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  weight = '900',
): void {
  let current = size;
  while (current > 24) {
    context.font = `${weight} ${current}px ${FONT}`;
    if (context.measureText(text).width <= maxWidth) break;
    current -= 2;
  }
}

function drawFrame(
  context: CanvasRenderingContext2D,
  frame: FrameDrawable,
  x: number,
  y: number,
  width: number,
  height: number,
  angle = 0,
): void {
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.drawImage(frame.image, 0, 0, frame.width, frame.height, -width / 2, -height / 2, width, height);
  context.restore();
}

function drawLantern(context: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.strokeStyle = '#ffd27a';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(0, -95);
  context.lineTo(0, -67);
  context.stroke();
  context.fillStyle = '#8b111a';
  context.beginPath();
  context.ellipse(0, 0, 54, 67, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#ffbd52';
  context.lineWidth = 7;
  context.beginPath();
  context.ellipse(0, 0, 54, 67, 0, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = '#ffd77f';
  fillRounded(context, '#ffd77f', -36, -86, 72, 13, 6);
  context.fillStyle = '#a81b23';
  fillRounded(context, '#a81b23', -30, -79, 60, 11, 5);
  for (let index = -2; index <= 2; index++) {
    context.strokeStyle = '#f6a83f';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(index * 12, 68);
    context.lineTo(index * 12, 104);
    context.stroke();
  }
  context.restore();
}

function drawBackground(context: CanvasRenderingContext2D): void {
  const gradient = context.createLinearGradient(0, 0, 0, STACK_SHARE_HEIGHT);
  gradient.addColorStop(0, '#8f1720');
  gradient.addColorStop(0.44, '#c92f2d');
  gradient.addColorStop(1, '#661019');
  context.fillStyle = gradient;
  context.fillRect(0, 0, STACK_SHARE_WIDTH, STACK_SHARE_HEIGHT);

  const glow = context.createRadialGradient(540, 330, 50, 540, 330, 620);
  glow.addColorStop(0, 'rgba(255,216,126,.28)');
  glow.addColorStop(1, 'rgba(255,216,126,0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, STACK_SHARE_WIDTH, STACK_SHARE_HEIGHT);

  context.strokeStyle = 'rgba(255,216,126,.23)';
  context.lineWidth = 3;
  for (let index = 0; index < 9; index++) {
    context.beginPath();
    context.arc(540, 380, 190 + index * 46, Math.PI * 1.08, Math.PI * 1.92);
    context.stroke();
  }

  for (let row = 0; row < 6; row++) {
    for (let column = 0; column < 8; column++) {
      const x = 86 + column * 130 + (row % 2 ? 54 : 0);
      const y = 455 + row * 152;
      context.fillStyle = row % 2 ? 'rgba(255,210,122,.12)' : 'rgba(255,244,210,.08)';
      context.beginPath();
      context.arc(x, y, 7, 0, Math.PI * 2);
      context.fill();
    }
  }

  drawLantern(context, 76, 167, .68);
  drawLantern(context, 1004, 167, .68);
  drawLantern(context, 174, 105, .38);
  drawLantern(context, 906, 105, .38);

  context.strokeStyle = 'rgba(255,210,122,.85)';
  context.lineWidth = 6;
  roundedRect(context, 30, 30, 1020, 1380, 46);
  context.stroke();
  context.strokeStyle = 'rgba(255,238,187,.35)';
  context.lineWidth = 2;
  roundedRect(context, 52, 52, 976, 1336, 34);
  context.stroke();
}

function drawTexts(context: CanvasRenderingContext2D, scene: StackShareScene): ReturnType<typeof createStackShareCopy> {
  const copy = scene.ending ? createStackHomecomingCopy(scene.result) : createStackShareCopy(scene.stage, scene.result);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.save();
  context.shadowColor = 'rgba(73,5,11,.72)';
  context.shadowBlur = 18;
  context.shadowOffsetY = 8;
  fitFont(context, copy.title, 900, 94);
  context.fillStyle = gold;
  context.fillText(copy.title, 540, 156);
  context.restore();

  const pillW = scene.ending ? 380 : 290;
  fillRounded(context, 'rgba(93,9,16,.42)', 540 - pillW / 2, 224, pillW, 64, 32);
  context.strokeStyle = 'rgba(255,225,157,.72)';
  context.lineWidth = 3;
  roundedRect(context, 542 - pillW / 2, 226, pillW - 4, 60, 30);
  context.stroke();
  context.font = `700 34px ${FONT}`;
  context.fillStyle = pale;
  context.fillText(scene.ending ? copy.stageText : scene.stageLabel ?? copy.stageText, 540, 256);

  fitFont(context, copy.statsText, 900, 45, '800');
  context.fillStyle = pale;
  context.fillText(copy.statsText, 540, 346);
  return copy;
}

function drawFallbackCar(context: CanvasRenderingContext2D): void {
  context.save();
  context.shadowColor = 'rgba(35,0,5,.55)';
  context.shadowBlur = 30;
  context.shadowOffsetY = 24;
  fillRounded(context, '#8f141c', 92, 514, 896, 548, 74);
  context.restore();
  fillRounded(context, '#b52228', 108, 500, 864, 500, 68);
  fillRounded(context, '#6f1018', 188, 576, 704, 286, 36);
  fillRounded(context, '#17141b', 207, 594, 666, 248, 26);
  fillRounded(context, '#ffb34c', 118, 766, 96, 58, 18);
  fillRounded(context, '#ffb34c', 866, 766, 96, 58, 18);
  fillRounded(context, '#f7d178', 370, 932, 340, 48, 22);
  fillRounded(context, '#2b1115', 420, 990, 240, 38, 18);
}

function drawCargo(
  context: CanvasRenderingContext2D,
  frame: FrameDrawable | null,
  items: readonly (FrameDrawable | null)[],
  bodyX: number,
  bodyY: number,
  bodyWidth: number,
  bodyHeight: number,
): void {
  const hole = {
    x: bodyX + STACK_BODY_HOLE.left / STACK_BODY_SIZE.w * bodyWidth,
    y: bodyY + STACK_BODY_HOLE.top / STACK_BODY_SIZE.h * bodyHeight,
    w: (STACK_BODY_HOLE.right - STACK_BODY_HOLE.left) / STACK_BODY_SIZE.w * bodyWidth,
    h: (STACK_BODY_HOLE.bottom - STACK_BODY_HOLE.top) / STACK_BODY_SIZE.h * bodyHeight,
  };
  context.save();
  roundedRect(context, hole.x, hole.y, hole.w, hole.h, 28);
  context.clip();
  if (frame) {
    drawFrame(context, frame, hole.x + hole.w / 2, hole.y + hole.h / 2, hole.w + 4, hole.h + 4);
  } else {
    context.fillStyle = '#17131a';
    context.fillRect(hole.x, hole.y, hole.w, hole.h);
    context.fillStyle = 'rgba(255,207,111,.2)';
    for (let stripe = 0; stripe < 8; stripe++) {
      context.fillRect(hole.x + stripe * hole.w / 8, hole.y, 2, hole.h);
    }
  }

  for (let index = 0; index < STACK_CARGO_POSITIONS.length && index < items.length; index++) {
    const item = items[index];
    if (!item) continue;
    const [px, py, angle] = STACK_CARGO_POSITIONS[index];
    const max = Math.min(hole.w * .24, hole.h * .48, 164);
    const ratio = item.width / item.height;
    const width = ratio >= 1 ? max : max * ratio;
    const height = ratio >= 1 ? max / ratio : max;
    drawFrame(
      context,
      item,
      hole.x + hole.w * px,
      hole.y + hole.h * py,
      width,
      height,
      angle,
    );
  }
  context.restore();
  context.strokeStyle = 'rgba(255,211,125,.78)';
  context.lineWidth = 7;
  roundedRect(context, hole.x - 2, hole.y - 2, hole.w + 4, hole.h + 4, 30);
  context.stroke();
}

function drawPill(context: CanvasRenderingContext2D, text: string, y: number, size: number, fillColor: string, textColor: string): void {
  context.font = `800 ${size}px ${FONT}`;
  const width = Math.min(960, context.measureText(text).width + size * 1.6);
  fillRounded(context, fillColor, 540 - width / 2, y - size * .85, width, size * 1.7, size * .85);
  context.strokeStyle = 'rgba(255,225,157,.8)';
  context.lineWidth = 3;
  roundedRect(context, 540 - width / 2 + 2, y - size * .85 + 2, width - 4, size * 1.7 - 4, size * .85 - 2);
  context.stroke();
  fitFont(context, text, width - size, size, '800');
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = textColor;
  context.fillText(text, 540, y + 1);
}

/** Non-sedan ride: its rear art with the goods heaped on the load area. */
function roundFill(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  context.beginPath();
  if (typeof context.roundRect === 'function') context.roundRect(x, y, w, h, r);
  else context.rect(x, y, w, h);
  context.fill();
}

/** Festive province plate over the painted blank plate of a ride drawn at (x, y, w, h) on the card. */
function drawPlate(context: CanvasRenderingContext2D, key: VehicleKey, art: {readonly w: number; readonly h: number}, x: number, y: number, w: number, h: number, text: string): void {
  const box = plateBox(key, art);
  const pw = box.w * w, ph = box.h * h;
  const px = x + box.cx * w - pw / 2, py = y + box.cy * h - ph / 2;
  const radius = Math.min(ph * .2, 10);
  context.save();
  context.fillStyle = '#16120e';
  roundFill(context, px, py, pw, ph, radius);
  const inset = Math.max(2, ph * .07);
  context.fillStyle = '#ffcc26';
  roundFill(context, px + inset, py + inset, pw - inset * 2, ph - inset * 2, Math.max(1, radius - inset));
  const size = plateFontSize(text, pw - inset * 2, ph - inset * 2);
  context.fillStyle = '#16120e';
  context.font = `900 ${size.toFixed(1)}px ${FONT}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, px + pw / 2, py + ph / 2 + size * .04);
  context.restore();
}

function drawRide(
  context: CanvasRenderingContext2D,
  ride: StackShareRide,
  art: FrameDrawable | null,
  items: readonly (FrameDrawable | null)[],
  plate: string,
): void {
  const maxH = 610, maxW = 900;
  let h = maxH, w = h * ride.w / ride.h * (ride.stretchX ?? 1);
  if (w > maxW) { w = maxW; h = w / (ride.w / ride.h * (ride.stretchX ?? 1)); }
  const x = 540 - w / 2, y = 1080 - h;
  if (art) {
    context.save();
    context.shadowColor = 'rgba(35,0,5,.55)';
    context.shadowBlur = 30;
    context.shadowOffsetY = 18;
    drawFrame(context, art, x + w / 2, y + h / 2, w, h);
    context.restore();
    if (ride.key) drawPlate(context, ride.key, {w: ride.w, h: ride.h}, x, y, w, h, plate);
  } else {
    drawFallbackCar(context);
  }
  const region = ride.region ?? {x: .15, y: .35, w: .7, h: .3};
  const hole = {x: x + region.x * w, y: y + region.y * h, w: region.w * w, h: region.h * h};
  for (let index = 0; index < STACK_CARGO_POSITIONS.length && index < items.length; index++) {
    const item = items[index];
    if (!item) continue;
    const [px, py, angle] = STACK_CARGO_POSITIONS[index];
    const max = Math.min(hole.w * .3, hole.h * .7, 150);
    const ratio = item.width / item.height;
    const iw = ratio >= 1 ? max : max * ratio;
    const ih = ratio >= 1 ? max / ratio : max;
    drawFrame(context, item, hole.x + hole.w * px, hole.y + hole.h * (py * .9 - .1), iw, ih, angle);
  }
}

function drawCaption(context: CanvasRenderingContext2D, caption: string): void {
  context.save();
  context.shadowColor = 'rgba(71,5,12,.58)';
  context.shadowBlur = 20;
  context.shadowOffsetY = 10;
  fillRounded(context, '#ffd27a', 76, 1206, 928, 150, 44);
  context.restore();
  fillRounded(context, '#8f141c', 88, 1218, 904, 126, 34);
  context.strokeStyle = 'rgba(255,239,190,.78)';
  context.lineWidth = 3;
  roundedRect(context, 98, 1228, 884, 106, 27);
  context.stroke();
  fitFont(context, caption, 820, 56);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = pale;
  context.fillText(caption, 540, 1282);
  context.font = `700 24px ${FONT}`;
  context.fillStyle = 'rgba(255,225,162,.82)';
  context.fillText(`试玩：${STACK_SHARE_LINK}`, 540, 1392);
}

/** Finale card: bg_home (gate, parents, couplets, lanterns, firecrackers) with the tractor parked. */
async function renderHomecomingCanvas(scene: StackShareScene): Promise<string | null> {
  const [homeFrame, tractorFrame] = await Promise.all([loadArt('ui/bg_home'), loadArt('vehicles/tractor')]);
  const [home, tractor] = await Promise.all([
    freshDrawable('art/ui/bg_home', homeFrame),
    freshDrawable('art/vehicles/tractor', tractorFrame),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = STACK_SHARE_WIDTH;
  canvas.height = STACK_SHARE_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;
  drawBackground(context);
  if (home) {
    // Width-fit the 750×1334 art and crop so the gate and the parents sit mid-card.
    const h = STACK_SHARE_WIDTH * home.height / home.width;
    drawFrame(context, home, 540, h / 2 - 300, STACK_SHARE_WIDTH, h);
    const shade = context.createLinearGradient(0, 0, 0, 420);
    shade.addColorStop(0, 'rgba(20,6,20,.75)');
    shade.addColorStop(1, 'rgba(20,6,20,0)');
    context.fillStyle = shade;
    context.fillRect(0, 0, STACK_SHARE_WIDTH, 420);
  }
  if (tractor) {
    const h = 380, w = h * tractor.width / tractor.height;
    context.save();
    context.shadowColor = 'rgba(20,0,5,.55)';
    context.shadowBlur = 24;
    context.shadowOffsetY = 14;
    drawFrame(context, tractor, 840, 1180 - h / 2, w, h);
    context.restore();
    drawPlate(context, 'tractor', VEHICLE_ART_SIZE.tractor, 840 - w / 2, 1180 - h, w, h, plateText(scene.province));
  }
  const copy = drawTexts(context, scene);
  const provinceLine = formatStackShareProvince(scene.province, scene.result.victory, scene.rank ?? null, Math.random, scene.counted ?? true);
  if (provinceLine) drawPill(context, provinceLine, 422, 38, 'rgba(120,12,22,.82)', gold);
  drawCaption(context, copy.caption);
  return canvas.toDataURL('image/png');
}

async function renderShareCanvas(scene: StackShareScene): Promise<string | null> {
  if (!canUseBrowserCanvas()) return null;
  try {
    if (scene.ending) return await renderHomecomingCanvas(scene);
    const rideArt = scene.ride?.art ?? null;
    const [bodyFrame, trunkFrame, ...itemFrames] = await Promise.all([
      loadArt(rideArt ?? 'vehicles/sedan_v1_body'),
      rideArt ? Promise.resolve(undefined) : loadArt('vehicles/sedan_v1_trunk'),
      ...STACK_SHARE_ITEM_KEYS.map(key => loadArt(`items/${key}`)),
    ]);
    const paths = [`art/${rideArt ?? 'vehicles/sedan_v1_body'}`, 'art/vehicles/sedan_v1_trunk', ...STACK_SHARE_ITEM_KEYS.map(key => `art/items/${key}`)];
    const [bodyArt, trunkArt, ...itemArt] = await Promise.all(
      [bodyFrame, trunkFrame, ...itemFrames].map((frame, index) => freshDrawable(paths[index], frame)),
    );
    const canvas = document.createElement('canvas');
    canvas.width = STACK_SHARE_WIDTH;
    canvas.height = STACK_SHARE_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return null;
    drawBackground(context);
    const copy = drawTexts(context, scene);
    if (scene.ride?.art) {
      drawRide(context, scene.ride, bodyArt, itemArt, plateText(scene.province));
    } else {
      const bodyX = 90, bodyY = 474, bodyWidth = 900, bodyHeight = 562;
      const body = bodyArt;
      if (body) drawFrame(context, body, bodyX + bodyWidth / 2, bodyY + bodyHeight / 2, bodyWidth, bodyHeight);
      else drawFallbackCar(context);
      drawCargo(context, trunkArt, itemArt, bodyX, bodyY, bodyWidth, bodyHeight);
      if (body) drawPlate(context, 'sedan', {w: 1024, h: 640}, bodyX, bodyY, bodyWidth, bodyHeight, plateText(scene.province));
    }
    const provinceLine = formatStackShareProvince(scene.province, scene.result.victory, scene.rank ?? null, Math.random, scene.counted ?? true);
    if (provinceLine) drawPill(context, provinceLine, 422, 38, scene.result.victory ? 'rgba(120,12,22,.82)' : 'rgba(60,8,14,.82)', gold);
    const rideLine = formatStackShareVehicle(scene.ride?.name);
    if (rideLine) drawPill(context, rideLine, 1132, 30, 'rgba(93,9,16,.78)', pale);
    drawCaption(context, copy.caption);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function showShareOverlay(dataUrl: string, fileName: string): void {
  if (typeof document === 'undefined' || !document.body) return;
  document.getElementById('stack-share-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'stack-share-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', '晒战绩分享图');
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483000',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:16px', 'box-sizing:border-box',
    'background:rgba(25,4,9,.82)', 'backdrop-filter:blur(5px)',
    'font-family:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif',
  ].join(';');
  overlay.addEventListener('click', event => event.stopPropagation());
  overlay.addEventListener('touchstart', event => event.stopPropagation(), {passive:true});
  overlay.addEventListener('touchend', event => event.stopPropagation(), {passive:true});

  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:min(92vw,430px)', 'max-height:94vh', 'box-sizing:border-box',
    'padding:14px 14px 16px', 'border-radius:24px',
    'background:linear-gradient(160deg,#b4262c,#711019)',
    'border:3px solid #ffd27a', 'box-shadow:0 18px 60px rgba(0,0,0,.55)',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:12px',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = '长按图片保存 · 晒出你的满满一车';
  title.style.cssText = 'color:#fff2cf;font-size:15px;font-weight:700;letter-spacing:.04em;text-align:center';

  const image = document.createElement('img');
  image.id = 'stack-share-image';
  image.alt = `${GAME_TITLE}战绩分享图`;
  image.src = dataUrl;
  image.style.cssText = [
    'display:block', 'width:min(78vw,352px)', 'max-height:62vh',
    'height:auto', 'object-fit:contain', 'border-radius:16px',
    'box-shadow:0 10px 30px rgba(0,0,0,.36)', 'background:#7b1119',
  ].join(';');

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;width:min(78vw,352px)';

  const download = document.createElement('a');
  download.id = 'stack-share-download';
  download.href = dataUrl;
  download.download = fileName;
  download.textContent = '下载图片';
  download.style.cssText = [
    'flex:1', 'display:flex', 'align-items:center', 'justify-content:center',
    'min-height:44px', 'border-radius:14px', 'text-decoration:none',
    'background:#ffd27a', 'color:#5f1018', 'font-size:16px', 'font-weight:800',
  ].join(';');

  const close = document.createElement('button');
  close.id = 'stack-share-close';
  close.type = 'button';
  close.textContent = '关闭';
  close.style.cssText = [
    'flex:1', 'min-height:44px', 'border-radius:14px', 'cursor:pointer',
    'background:#74131b', 'color:#ffe3a5', 'border:2px solid #ffd27a',
    'font-family:inherit', 'font-size:16px', 'font-weight:800',
  ].join(';');
  close.addEventListener('click', () => overlay.remove());

  actions.append(download, close);
  panel.append(title, image, actions);
  overlay.append(panel);
  document.body.appendChild(overlay);
}

/** Generates and displays a share card. Returns the data URL, or null outside a browser. */
export async function showStackShareImage(scene: StackShareScene): Promise<string | null> {
  const dataUrl = await renderShareCanvas(scene);
  if (!dataUrl) return null;
  showShareOverlay(dataUrl, stackShareFileName(scene.stage, scene.result.victory));
  return dataUrl;
}
