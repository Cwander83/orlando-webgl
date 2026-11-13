# Orlando in Ink & Light

An interactive 3D WebGL experience depicting Lake Eola and the Downtown Orlando skyline across Sunrise, Golden Hour, a 4 PM Florida Storm, and Night — styled in editorial deep navy (`#0b1437`), warm cream (`#fbfaf6`), and custom GLSL ink-and-water shaders.

Built as a featured open-source portfolio piece for [chriswander.com](https://chriswander.com).

## Status

**Phase:** Architecture & Implementation Planning (awaiting plan sign-off before Milestone 0 scaffold).

- **Full Design & Implementation Plan:** [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md)

## Planned Tech Stack

- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS v4 (Node `24.x`, `npm`, deployed on Vercel)
- **3D & Shaders:** Three.js, React Three Fiber (`@react-three/fiber`), `@react-three/drei`, custom GLSL (`InkSkyMaterial`, `LakeWaterMaterial`, `StylizedCityMaterial`), GPU-tier-gated single-pass `@react-three/postprocessing` `Bloom`
- **Motion Choreography:** `GSAP` + `ScrollTrigger` over native scroll feeding a zero-rerender mutable scene store damped in `useFrame`
- **3D Asset Pipeline:** OpenStreetMap Orlando footprints refined in Blender (Lake Eola Fountain + 6 signature downtown towers) → `gltf-transform` Meshopt-compressed `.glb` (`< 250 KB`)
- **Live Mode:** Real-time Orlando solar position (`America/New_York`) + keyless `Open-Meteo` weather sync
- **Accessibility & Fallbacks:** Full `prefers-reduced-motion` static chapter camera mode, keyboard chapter/orbit controls, and graceful static poster fallback when WebGL is unavailable

## Branch Workflow

- `main` — Production releases (owner-merged only)
- `develop` — Active integration branch; all `feat/*` and `spike/*` branches cut from and merge into `develop`

## License

[MIT](./LICENSE)
