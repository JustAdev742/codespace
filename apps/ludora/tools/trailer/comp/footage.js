// Where each shot comes from: real Ludora footage, filmed with Playwright at 30 fps.
// Sequences: { dir, count, in (first frame), speed }. Stills: { file }. Paths are relative to the trailer folder.
window.FOOTAGE = {
  q_big: { dir: 'footage/classic/r8-big', count: 442, in: 70, speed: 1.25 },
  hero_correct: { dir: 'footage/classic/r2-phone', count: 435, in: 46, speed: 2 },
  // The two phones either side are the same question at other moments: one still choosing, one locked in.
  phone_b: { dir: 'footage/classic/r2-phone', count: 435, in: 1, speed: 0.7 },
  phone_c: { dir: 'footage/classic/r2-phone', count: 435, in: 62 },
  lb_big: { dir: 'footage/classic/r8-big', count: 442, in: 296 },
  lobby: { dir: 'footage/classic/b1-lobby', count: 350, in: 1, speed: 2 },
  join_phone: { dir: 'footage/classic/p1-join', count: 111, in: 5 },
  lobby_fill: { dir: 'footage/classic/b1-lobby', count: 350, in: 200 },
  podium: { dir: 'footage/classic/b5-podium', count: 238, in: 34 },
  first_phone: { dir: 'footage/classic/r6-phone', count: 424, in: 265 },
  m_classic: { dir: 'footage/classic/r3-big', count: 425, in: 1 },
  classic_still: { file: 'footage/classic/b1-lobby.png' },
  // Laptop screenshots at 1920x1080 (the report is a full page). crop0 -> crop1 is a slow move across the
  // part of the page that matters, as [x, y, width, height] in the screenshot's pixels.
  t_library: { file: 'footage/extras/library.png', size: [1920, 1080], crop0: [470, 70, 1100, 619], crop1: [560, 400, 1000, 562] },
  t_report: { file: 'footage/extras/report-full.png', size: [1920, 1275], crop0: [490, 60, 1200, 675], crop1: [490, 560, 1200, 675] },
  t_host: { file: 'footage/extras/host-setup.png', size: [1920, 1080], crop0: [470, 80, 1220, 686], crop1: [470, 400, 1200, 675] },
  t_collection: { file: 'footage/extras/collection-laptop.png', size: [1920, 1080], crop0: [480, 85, 1200, 675], crop1: [520, 380, 1100, 619] },
  t_privacy: { file: 'footage/extras/settings.png', size: [1920, 1080], crop0: [560, 470, 1080, 608], crop1: [620, 515, 1000, 562] },
  t_access: { file: 'footage/extras/settings.png', size: [1920, 1080], crop0: [480, 170, 1200, 675], crop1: [560, 230, 1000, 562] },
  // An 11-year-old's account on a phone: privacy starts at friends-only; then Larger text and High contrast switched on.
  p_privacy: { file: 'footage/school/privacy-phone.png' },
  access: { dir: 'footage/school/access', count: 111, in: 5, speed: 1.3 },
  t_lobby: { file: 'footage/classic/b1-lobby.png' },
  p_joined: { file: 'footage/classic/p1-join/f0111.jpg' },
  p_shop: { file: 'footage/extras/lantern-1/f0001.jpg' },
  // A Starfall Lantern opening on Maya's phone: it glows, then a legendary Glim at frame 54.
  lantern: { dir: 'footage/extras/lantern-1', count: 141, in: 13 },
  lantern_burst_t: 53.4,
  podium_burst_t: 69.25,
};
for (const slug of ['comet-dash', 'quick-draw', 'lantern-out', 'confidence', 'glimgo', 'lantern-match', 'word-scramble', 'sky-lanterns', 'gloom-giant', 'tug-of-war', 'night-market', 'lantern-guard', 'glim-duels', 'lantern-trail', 'lantern-lands', 'festival-workshop']) {
  // Sky Lanterns and Confidence were filmed again later in the game, once lanterns were flying and a question was up.
  const folder = slug === 'sky-lanterns' || slug === 'confidence' ? 'redo' : 'modes';
  window.FOOTAGE[`m_${slug}`] = { dir: `footage/${folder}/${slug}-big`, count: 151, in: 1 };
}
