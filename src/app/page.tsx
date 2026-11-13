import { ExperienceLoader } from '@/components/canvas/ExperienceLoader';
import { SceneHud } from '@/components/dom/SceneHud';
import { ScrollChapters } from '@/components/dom/ScrollChapters';
import { TopNav } from '@/components/dom/TopNav';

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-navy-900 text-cream-50">
      <TopNav />
      <ExperienceLoader />
      <ScrollChapters />
      <SceneHud />
    </div>
  );
}
