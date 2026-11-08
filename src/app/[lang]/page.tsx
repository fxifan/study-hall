import type { Metadata } from "next";
import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
import { Wordmark } from "@/components/wordmark";
import { localizePath } from "@/i18n/config";
import { getLocale } from "@/i18n/server";
import { CONTACT_EMAIL } from "@/lib/contact";
import { homeCopy } from "./_home/copy";
import { HomeEffects } from "./_home/home-effects";
import "./home.css";

/**
 * The Edumi home page (/): Edumi's core is studying with friends (student sign-up at /join), with
 * Edumi Study Hall (/study_hall) and Edumi for Tutors (/tutors) beside it. Copy in _home/copy.ts.
 * Design: "Tiles" (owner, 7 Nov 2026), a light, ordered page of simple shapes in muted sage, pink,
 * sand and slate (home.css). Motion is progressive: content is visible without JavaScript and with reduced
 * motion (home.css, HomeEffects).
 */
/** Simple line icons for the four student tiles: leaderboard, standout, timer, quiz. */
const ICONS = [
  <svg key="board" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </svg>,
  <svg key="standout" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="9" r="6" />
    <path d="M8.5 14 7 22l5-3 5 3-1.5-8" />
  </svg>,
  <svg key="timer" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l2.5 2M10 2h4" />
  </svg>,
  <svg key="quiz" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 6h16M4 12h9M4 18h6" />
    <path d="m15 17 2 2 4-4" />
  </svg>,
];

export async function generateMetadata(): Promise<Metadata> {
  const t = homeCopy(await getLocale());
  return { title: { absolute: t.meta.title }, description: t.meta.description };
}

export default async function HomePage() {
  const locale = await getLocale();
  const t = homeCopy(locale);
  const href = (p: string) => localizePath(p, locale);
  const studyHall = href("/study_hall");
  const tutors = href("/tutors");
  const join = href("/join");
  const studentFeatures = t.features.items.filter((f) => f.tag === "Students");
  const otherFeatures = t.features.items.filter((f) => f.tag !== "Students");

  return (
    <div className="home">
      <HomeEffects studyHallHref={studyHall} />
      <a className="home-skip" href="#main">
        {locale === "zh" ? "跳到正文" : "Skip to content"}
      </a>

      <header className="home-nav">
        <div className="home-wrap home-nav-in">
          <Link href={href("/")} aria-label="Edumi home" className="home-brand">
            <Wordmark />
          </Link>
          <nav aria-label={t.nav.label} className="home-nav-links">
            <a href="#students">{t.nav.students}</a>
            <Link href={studyHall}>{t.nav.studyHall}</Link>
            <Link href={tutors}>{t.nav.tutors}</Link>
          </nav>
          <div className="home-nav-end">
            <LanguageSwitch locale={locale} className="home-quiet" />
            <Link href={href("/login")} className="home-btn home-btn--ghost">
              {t.nav.logIn}
            </Link>
            <Link href={join} className="home-btn home-btn--primary">
              {t.nav.join}
            </Link>
          </div>
          {/* Phones: the same links in a disclosure, no script needed. */}
          <details className="home-menu">
            <summary>{t.nav.menu}</summary>
            <nav aria-label={t.nav.label}>
              <Link href={join}>{t.nav.join}</Link>
              <a href="#students">{t.nav.students}</a>
              <Link href={studyHall}>{t.nav.studyHall}</Link>
              <Link href={tutors}>{t.nav.tutors}</Link>
              <Link href={href("/login")}>{t.nav.logIn}</Link>
              <LanguageSwitch locale={locale} className="home-quiet" />
            </nav>
          </details>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="home-hero" aria-labelledby="home-title" lang="en">
          <div className="home-wrap home-hero-grid">
            <div className="home-hero-copy">
              <p className="home-eyebrow" data-rv>
                <span className="home-dot" aria-hidden="true" />
                {t.hero.eyebrow}
              </p>
              <h1 id="home-title" data-rv style={{ "--d": 1 } as React.CSSProperties}>
                {t.hero.title}
              </h1>
              <p className="home-lede" data-rv style={{ "--d": 2 } as React.CSSProperties}>
                {t.hero.lede}
              </p>
              <div className="home-cta" data-rv style={{ "--d": 3 } as React.CSSProperties}>
                <Link href={join} className="home-btn home-btn--primary">
                  {t.hero.primary} <span aria-hidden="true">→</span>
                </Link>
                <Link href={studyHall} className="home-btn home-btn--ghost">
                  {t.hero.secondary}
                </Link>
              </div>
              <dl className="home-proof" data-rv style={{ "--d": 4 } as React.CSSProperties}>
                {t.hero.proof.map((p) => (
                  <div key={p.label}>
                    <dt>
                      {"was" in p && p.was ? (
                        <>
                          <s className="trial-price-was" aria-label={`Usually ${p.was}`}>
                            {p.was}
                          </s>{" "}
                        </>
                      ) : null}
                      {p.value}
                    </dt>
                    <dd>{p.label}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Product visual: the student app's real pieces as simple shapes, with fictional names. */}
            <figure className="home-stage" aria-label={t.hero.visualLabel} data-rv style={{ "--d": 2 } as React.CSSProperties}>
              <span className="home-shape home-shape--a" aria-hidden="true" />
              <span className="home-shape home-shape--b" aria-hidden="true" />
              <div className="home-tile home-tile--board">
                <p className="home-tile-head">
                  <span>Methods crew · {t.hero.board.split("·").pop()?.trim()}</span>
                  <span className="home-mono">{t.hero.liveTag}</span>
                </p>
                <ol className="home-board">
                  <li className="home-row home-row--first">
                    <span className="home-rank">1</span>
                    <span>
                      Leo K. <span className="home-live">● {t.hero.live}</span>
                    </span>
                    <strong>1h 10m</strong>
                  </li>
                  <li className="home-row">
                    <span className="home-rank">2</span>
                    <span>Ava S.</span>
                    <strong>40m</strong>
                  </li>
                  <li className="home-row home-row--you">
                    <span className="home-rank">3</span>
                    <span>
                      {t.hero.you} <span className="home-nudge">{t.hero.yourMove}</span>
                    </span>
                    <strong>0m</strong>
                  </li>
                </ol>
              </div>
              <div className="home-tile home-tile--goal" aria-hidden="true">
                <p className="home-tile-head">{t.hero.goalShort}</p>
                <span className="home-ring" style={{ "--p": 31 } as React.CSSProperties}>
                  <span>31%</span>
                </span>
                <p className="home-tile-foot">{t.hero.goalOf}</p>
              </div>
              <div className="home-tile home-tile--quiz" aria-hidden="true">
                <p className="home-tile-head">{t.hero.quiz}</p>
                <p className="home-score">{t.hero.quizScore}</p>
                <span className="home-bar">
                  <span style={{ width: "83%" }} />
                </span>
                <p className="home-chips">
                  <span className="home-chip">+10 points</span>
                  <span className="home-chip">Silver Striver</span>
                </p>
              </div>
              <figcaption className="home-note">{t.hero.visualNote}</figcaption>
            </figure>
          </div>
        </section>

        {/* Student features: bento tiles */}
        <section className="home-section" aria-labelledby="features-title">
          <div className="home-wrap">
            <p className="home-label" data-rv>
              {t.features.label}
            </p>
            <h2 id="features-title" data-rv>
              {t.features.title}
            </h2>
            <ul className="home-bento">
              {studentFeatures.map((f, i) => (
                <li key={f.title} lang="en" className={`home-bento-tile home-bento-tile--${i + 1}`} data-rv style={{ "--d": i } as React.CSSProperties}>
                  <span className="home-icon" aria-hidden="true">
                    {ICONS[i]}
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </ul>
            <ul className="home-features">
              {otherFeatures.map((f, i) => (
                <li key={f.title} className="home-feature" data-rv style={{ "--d": i % 4 } as React.CSSProperties}>
                  <span className={`home-tag ${f.tag === "Study Hall" ? "home-tag--sand" : "home-tag--slate"}`}>{f.tag}</span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Inside the app */}
        <section className="home-section home-section--tight" aria-labelledby="app-title" lang="en">
          <div className="home-wrap">
            <p className="home-label" data-rv>
              {t.app.label}
            </p>
            <h2 id="app-title" data-rv>
              {t.app.title}
            </h2>
            <div className="home-app" data-rv aria-hidden="true">
              <div className="home-app-main">
                <div className="home-app-goal">
                  <span className="home-ring home-ring--sm" style={{ "--p": 31 } as React.CSSProperties}>
                    <span />
                  </span>
                  <div>
                    <p className="home-app-k">{t.app.goal}</p>
                    <span className="home-line">
                      <span style={{ width: "31%" }} />
                    </span>
                    <p className="home-mono">{t.app.goalLine}</p>
                  </div>
                </div>
                <div className="home-app-timer">
                  <div>
                    <p className="home-clock">24:18</p>
                    <p className="home-mono">{t.app.timer}</p>
                  </div>
                  <span className="home-app-actions">
                    <span className="home-btn home-btn--ghost home-btn--sm">{t.app.pause}</span>
                    <span className="home-btn home-btn--primary home-btn--sm">{t.app.stop}</span>
                  </span>
                </div>
                <ul className="home-chat">
                  {t.app.chat.map((m) => (
                    <li key={m.text} className={`home-msg home-msg--${m.kind}`}>
                      {m.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="home-app-side">
                <div className="home-tile">
                  <p className="home-tile-head">
                    <span>{t.app.board}</span>
                    <span className="home-mono">{t.app.week}</span>
                  </p>
                  <ol className="home-board">
                    <li className="home-row home-row--first">
                      <span className="home-rank">1</span>
                      <span>Leo K.</span>
                      <strong>1h 10m</strong>
                    </li>
                    <li className="home-row">
                      <span className="home-rank">2</span>
                      <span>Ava S.</span>
                      <strong>40m</strong>
                    </li>
                    <li className="home-row home-row--you">
                      <span className="home-rank">3</span>
                      <span>{t.hero.you}</span>
                      <strong>24m</strong>
                    </li>
                  </ol>
                </div>
                <div className="home-tile home-tile--quiz">
                  <p className="home-tile-head">{t.app.tier}</p>
                  <p className="home-score">{t.app.tierName}</p>
                  <span className="home-bar">
                    <span style={{ width: "62%" }} />
                  </span>
                  <p className="home-mono">{t.app.toNext}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Products */}
        <section className="home-section home-section--tight" aria-labelledby="products-title">
          <div className="home-wrap">
            <p className="home-label" data-rv>
              {t.products.label}
            </p>
            <h2 id="products-title" data-rv>
              {t.products.title}
            </h2>
            <div className="home-products">
              {(
                [
                  [t.products.students, join, "st"],
                  [t.products.studyHall, studyHall, "sh"],
                  [t.products.tutors, tutors, "tu"],
                ] as const
              ).map(([p, link, key], i) => (
                <article
                  key={key}
                  id={key === "st" ? "students" : undefined}
                  lang={key === "st" ? "en" : undefined}
                  className={`home-product home-product--${key}`}
                  data-rv
                  style={{ "--d": i } as React.CSSProperties}
                >
                  <p className="home-mono">{p.for}</p>
                  <h3>{p.name}</h3>
                  <p className="home-product-body">{p.body}</p>
                  <ul>
                    {p.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                  <Link href={link} className={`home-btn ${key === "st" ? "home-btn--light" : "home-btn--ghost"}`}>
                    {p.cta} <span aria-hidden="true">→</span>
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Closing */}
        <section className="home-closing-wrap" aria-labelledby="closing-title">
          <div className="home-wrap">
            <div className="home-closing" data-rv>
              <span className="home-shape home-shape--c" aria-hidden="true" />
              <span className="home-shape home-shape--d" aria-hidden="true" />
              <h2 id="closing-title">{t.closing.title}</h2>
              <div className="home-cta">
                <Link href={join} className="home-btn home-btn--primary">
                  {t.closing.join} <span aria-hidden="true">→</span>
                </Link>
                <Link href={studyHall} className="home-btn home-btn--ghost">
                  {t.closing.studyHall}
                </Link>
                <Link href={`${tutors}#signup`} className="home-btn home-btn--ghost">
                  {t.closing.tutors}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-foot">
        <div className="home-wrap home-foot-in">
          <div>
            <Wordmark />
            <p>{t.footer.tagline}</p>
          </div>
          <nav aria-label="Footer">
            <Link href={join}>{t.footer.students}</Link>
            <Link href={studyHall}>{t.footer.studyHall}</Link>
            <Link href={tutors}>{t.footer.tutors}</Link>
            <Link href={href("/legal/privacy")}>{t.footer.privacy}</Link>
            <Link href={href("/legal/terms")}>{t.footer.terms}</Link>
            <Link href={href("/legal/house-rules")}>{t.footer.houseRules}</Link>
            <Link href={href("/tutors/terms")}>{t.footer.tutorTerms}</Link>
            <Link href={href("/tutors/privacy")}>{t.footer.tutorPrivacy}</Link>
            <Link href={href("/login")}>{t.footer.logIn}</Link>
            <a href={`mailto:${CONTACT_EMAIL}`}>{t.footer.contact}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
