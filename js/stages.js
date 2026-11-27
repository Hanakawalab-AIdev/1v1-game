// stages.js — stage definitions. Each stage lists its LEFT half (plus centred pieces);
// entries with `mirror: true` get an automatically mirrored twin, so every stage is
// left/right symmetric by construction (horizontal motion is mirrored too).
//
// move: { axis: 'x' | 'y', range: px, period: ticks, phase: ticks }
//   axis x: platform travels `range` px away from its authored x (mirrored twin travels the other way)
//   axis y: platform rises `range` px above its authored y and comes back
//   Motion is a smoothstep ping-pong of the round tick counter → fully deterministic.
(function (root) {
  'use strict';
  const SG = root.SG;

  SG.STAGES = [
    {
      id: 'meadow',
      theme: 'meadow',
      name: { en: 'Green Meadow', ja: 'みどりの草原' },
      desc: {
        en: 'The original arena. Five fixed platforms, no surprises.',
        ja: 'おなじみのステージ。動かない足場が5つ。',
      },
      tags: ['classic'],
      width: 800,
      groundY: 340,
      spawnX: 150,
      platforms: [
        { x: 80, y: 260, w: 160, mirror: true },
        { x: 320, y: 190, w: 160 },
        { x: 120, y: 120, w: 120, mirror: true },
      ],
    },
    {
      id: 'docks',
      theme: 'docks',
      name: { en: 'Sunset Docks', ja: '夕焼けの桟橋' },
      desc: {
        en: 'Two rafts drift in and out. Time your jumps to the tide.',
        ja: '2つのイカダが左右に行き来する。タイミングが勝負。',
      },
      tags: ['moving'],
      width: 800,
      groundY: 340,
      spawnX: 150,
      platforms: [
        { x: 40, y: 270, w: 120, mirror: true },
        { x: 170, y: 200, w: 110, mirror: true, move: { axis: 'x', range: 120, period: 300, phase: 0 } },
        { x: 340, y: 120, w: 120 },
        { x: 30, y: 140, w: 90, mirror: true },
      ],
    },
    {
      id: 'cavern',
      theme: 'cavern',
      name: { en: 'Crystal Cavern', ja: 'クリスタル洞窟' },
      desc: {
        en: 'Twin lifts carry fighters up and down. Ride them to strike from above.',
        ja: '上下に動くリフトに乗って、上から踏みつけよう。',
      },
      tags: ['moving'],
      width: 800,
      groundY: 340,
      spawnX: 150,
      platforms: [
        { x: 60, y: 290, w: 100, mirror: true, move: { axis: 'y', range: 150, period: 360, phase: 0 } },
        { x: 330, y: 230, w: 140 },
        { x: 200, y: 145, w: 100, mirror: true },
        { x: 360, y: 80, w: 80 },
      ],
    },
    {
      id: 'neon',
      theme: 'neon',
      name: { en: 'Neon Rooftops', ja: 'ネオンの屋上' },
      desc: {
        en: 'A wide scrolling skyline with sliding and rising platforms.',
        ja: 'スクロールする広いステージ。横と縦に動く足場あり。',
      },
      tags: ['wide', 'moving'],
      width: 1200,
      groundY: 340,
      spawnX: 280,
      platforms: [
        { x: 110, y: 260, w: 150, mirror: true },
        { x: 320, y: 190, w: 110, mirror: true, move: { axis: 'x', range: 90, period: 280, phase: 0 } },
        { x: 540, y: 250, w: 120 },
        { x: 550, y: 150, w: 100, move: { axis: 'y', range: 60, period: 240, phase: 0 } },
        { x: 50, y: 150, w: 110, mirror: true },
      ],
    },
  ];

  SG.getStageDef = (id) => SG.STAGES.find((s) => s.id === id) || SG.STAGES[0];
})(typeof globalThis !== 'undefined' ? globalThis : window);
