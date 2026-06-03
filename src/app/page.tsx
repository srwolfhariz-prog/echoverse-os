import { ArrowRight, Globe2, Sparkles } from "lucide-react";
import { EchoGuideButton } from "@/components/home/echo-guide-button";
import { HomeAuthLink } from "@/components/home/home-auth-link";
import { PlanetHeroVisual } from "@/components/home/planet-hero-visual";

export default function Home() {
  return (
    <section className="home-stage">
      <div className="home-gold-mist" />

      <div className="home-layout">
        <div className="home-copy">
          <div className="home-kicker">
            <Sparkles className="size-4" />
            Echoverse OS
          </div>

          <h1 className="home-title" aria-label="平行宇宙的回声">
            <span className="home-title-main">平行宇宙</span>
            <span className="home-title-sub">
              <span className="home-title-line" />
              的回声
            </span>
          </h1>

          <p className="home-subtitle">
            不是创造一个虚拟的自己，而是让那个被现实沉没的你，
            <br />
            在另一个角落有了回声。
          </p>

          <div className="home-description">
            <p>
              这里不是一个普通 AI 助手，而是一个通往平行宇宙的‘回声’系统。
            </p>
            <p>
              你会慢慢蒸馏出一个平行宇宙里的自己：TA 拥有与你相近的人格底色、记忆线索和处事方式。
            </p>
            <p>
              ‘回声’系统会把所有人格色彩沉淀成可下载的人格文档，你可以随时给TA写信，向另一个自己询问那些卡在心里的问题。
            </p>
            <p>
              你还能看见 TA 在另一个世界里的日常、心情和人生进度。你们在各自的世界生活，而‘回声’把你们连接在一起。
            </p>
          </div>

          <div className="home-actions">
            <HomeAuthLink href="/echo-room" className="premium-button home-primary-button">
              进入平行宇宙
              <ArrowRight className="size-4" />
            </HomeAuthLink>
            <HomeAuthLink href="/world" className="ghost-button home-secondary-button">
              看看平行小世界
              <Globe2 className="size-4" />
            </HomeAuthLink>
          </div>

          <EchoGuideButton />
        </div>

        <PlanetHeroVisual />
      </div>

      <p
        className="home-bottom-quote"
        aria-label="如果被现实磨平了棱角，那就来平行宇宙找找答案，看看另一段人生"
      >
        <span
          className="home-bottom-quote__mark home-bottom-quote__mark--left"
          aria-hidden="true"
        >
          “
        </span>
        <span className="home-bottom-quote__body">
          <span className="home-bottom-quote__line">
            如果被现实磨平了棱角，那就来平行宇宙找找答案，看看另一段人生
          </span>
          <span className="home-bottom-quote__shine" aria-hidden="true">
            <span>如果被现实磨平了棱角，那就来平行宇宙找找答案，看看另一段人生</span>
          </span>
        </span>
        <span
          className="home-bottom-quote__mark home-bottom-quote__mark--right"
          aria-hidden="true"
        >
          ”
        </span>
      </p>
    </section>
  );
}
