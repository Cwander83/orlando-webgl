'use client';

import dynamic from 'next/dynamic';

const DynamicExperienceRoot = dynamic(
  () => import('./ExperienceRoot').then((mod) => mod.ExperienceRoot),
  { ssr: false }
);

export function ExperienceLoader() {
  return <DynamicExperienceRoot />;
}
