import path from "node:path";
import process from "node:process";
import sharp from "sharp";

const root = process.cwd();
const width = 1734;
const height = 907;
const brandIconPath = path.join(root, "public", "clavisflow-studio-icon.png");
const outputPath = path.join(root, "public", "features-og.png");

const brandIcon = await sharp(brandIconPath)
  .resize(44, 44)
  .png()
  .toBuffer();

const background = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="page" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.64" stop-color="#fbfdfc"/>
        <stop offset="1" stop-color="#edf8f2"/>
      </linearGradient>
      <filter id="shadow" x="-25%" y="-25%" width="150%" height="150%">
        <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#0c5b3e" flood-opacity="0.08"/>
      </filter>
    </defs>

    <rect width="${width}" height="${height}" fill="url(#page)"/>
    <circle cx="1640" cy="-30" r="235" fill="#e5f6ec" opacity="0.42"/>
    <path d="M0 842 C250 760 455 900 744 856 C1032 812 1290 758 1734 834 L1734 907 L0 907Z" fill="#e5f5eb" opacity="0.62"/>
    <path d="M0 882 C318 802 520 930 826 883 C1124 837 1430 817 1734 873" fill="none" stroke="#cce9d9" stroke-width="4" opacity="0.72"/>

    <text x="652" y="103" fill="#0b704e" font-family="Yu Gothic, Meiryo, Noto Sans JP, sans-serif" font-size="32" font-weight="800" letter-spacing="1">ClavisFlow Studio でできること</text>
    <text x="867" y="257" text-anchor="middle" fill="#111827" font-family="Yu Gothic, Meiryo, Noto Sans JP, sans-serif" font-size="92" font-weight="800" letter-spacing="-5">データ処理が変わる、5つの理由。</text>

    <g fill="#ffffff" stroke="#dce8e1" stroke-width="3" filter="url(#shadow)">
      <rect x="70" y="340" width="500" height="190" rx="34"/>
      <rect x="617" y="340" width="500" height="190" rx="34"/>
      <rect x="1164" y="340" width="500" height="190" rx="34"/>
      <rect x="330" y="580" width="500" height="190" rx="34"/>
      <rect x="904" y="580" width="500" height="190" rx="34"/>
    </g>

    <g fill="none" stroke="#13805b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <g transform="translate(112 430) scale(1.5)"><path d="M15 2h-4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/><path d="M16.706 2.706A2.4 2.4 0 0 0 15 2v5a1 1 0 0 0 1 1h5a2.4 2.4 0 0 0-.706-1.706z"/><path d="M5 7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 1.732-1"/></g>
      <g transform="translate(659 430) scale(1.5)"><path d="m2 9 3-3 3 3"/><path d="M13 18H7a2 2 0 0 1-2-2V6"/><path d="m22 15-3 3-3-3"/><path d="M11 6h6a2 2 0 0 1 2 2v10"/></g>
      <g transform="translate(1206 430) scale(1.5)"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><path d="M8 12h8"/></g>
      <g transform="translate(372 670) scale(1.5)"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></g>
      <g transform="translate(946 670) scale(1.5)"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></g>
    </g>

    <g font-family="Yu Gothic, Meiryo, Noto Sans JP, sans-serif">
      <g><text x="112" y="399" fill="#819087" font-size="27" font-weight="800">01</text><text x="174" y="466" fill="#35413b" font-size="44" font-weight="800">形式を越える</text></g>
      <g><text x="659" y="399" fill="#819087" font-size="27" font-weight="800">02</text><text x="721" y="466" fill="#35413b" font-size="44" font-weight="800">繰り返し使う</text></g>
      <g><text x="1206" y="399" fill="#819087" font-size="27" font-weight="800">03</text><text x="1268" y="466" fill="#35413b" font-size="44" font-weight="800">探して共有</text></g>
      <g><text x="372" y="639" fill="#819087" font-size="27" font-weight="800">04</text><text x="434" y="706" fill="#35413b" font-size="44" font-weight="800">手元で処理</text></g>
      <g><text x="946" y="639" fill="#819087" font-size="27" font-weight="800">05</text><text x="1008" y="706" fill="#35413b" font-size="44" font-weight="800">AIで道具化</text></g>
    </g>
  </svg>
`);

await sharp(background)
  .composite([
    { input: brandIcon, left: 590, top: 66 },
  ])
  .png({ compressionLevel: 9 })
  .toFile(outputPath);

console.log(`Generated ${outputPath}`);
