import type { Metadata } from 'next';
import { LandingHeader } from '@/components/landing/landing-header';
import { LandingHero } from '@/components/landing/hero';
import { ScrollStory } from '@/components/landing/scroll-story';
import { DemoSection } from '@/components/landing/demo-section';
import { FeatureGrid } from '@/components/landing/feature-grid';
import { FinalCta } from '@/components/landing/final-cta';
import { SiteFooter } from '@/components/landing/site-footer';
import { StickyCta } from '@/components/landing/sticky-cta';
import { buildDemoPallet } from '@/lib/landing/demo';

// 公开落地页（product/落地页.md R-落地页-001 / design/落地页.md）：
// 单页、无需登录；桌面与手机共用同一响应式页面，不套任何应用壳。
export const metadata: Metadata = {
  title: '梅好木业｜木质包装参数化设计',
  description:
    '托盘、木箱等木质包装的参数化设计：调整尺寸实时生成 2D / 3D 视图、构件与木材料单。在线体验后免费注册。',
  openGraph: {
    title: '梅好木业｜木质包装参数化设计',
    description:
      '调整尺寸实时生成 2D / 3D 视图、构件与木材料单。木质包装方案从尺寸直接做到图纸和料单。',
    type: 'website',
  },
};

export default function LandingPage(): React.ReactElement {
  // 滚动叙事与首屏共用默认托盘，纯前端计算，不产生任何服务端状态。
  const storyDemo = buildDemoPallet('block', 1200, 800);

  return (
    <div
      data-landing
      className="min-h-screen bg-background pb-20 text-foreground md:pb-0"
    >
      <LandingHeader />
      <main>
        <LandingHero />
        <ScrollStory demo={storyDemo} />
        <DemoSection />
        <FeatureGrid />
        <FinalCta />
      </main>
      <SiteFooter />
      <StickyCta />
    </div>
  );
}
