# OKLCH Gamut Picker

Web color picker berbasis OKLCH dengan gamut masking untuk:

- RGB, sebagai default.
- PSO Coated V3, memakai boundary table yang digenerate dari profil ICC `PSOcoated_v3.icc`.
- PSO Uncoated V3, memakai boundary table dari profil ICC `PSOuncoated_v3_FOGRA52.icc`.

Fallback out-of-gamut bisa menggeser channel `L`, `C`, atau `H`; default-nya `C`.

## Commands

```bash
npm install
npm run dev
npm run build
npm run lint
```

## PSO Gamut Data

Profil ICC disalin ke `public/PSOcoated_v3.icc` dan
`public/PSOuncoated_v3_FOGRA52.icc`. Boundary table runtime ada di
`src/data/psoCoatedV3Gamut.ts` dan `src/data/psoUncoatedV3Gamut.ts`;
keduanya bisa dibuat ulang dengan:

```bash
python scripts/generate-pso-gamut.py
```
