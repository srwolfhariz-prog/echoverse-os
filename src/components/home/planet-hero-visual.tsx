"use client";

import Image from "next/image";
import { useState } from "react";

const PLANET_SRC = "/assets/visual/planet-luminous.svg";
const PLANET_FALLBACK_SRC = "/assets/visual/planet-luminous.svg";
const FIGURE_SRC = "/assets/visual/little-figure.png";

export function PlanetHeroVisual() {
  const [planetSrc, setPlanetSrc] = useState(PLANET_SRC);

  return (
    <div className="planet-hero-visual" aria-hidden="true">
      <div className="planet-hero-visual__ambient" />
      <div className="planet-hero-visual__backlight" />

      <div className="planet-hero-visual__body">
        <div className="planet-hero-visual__belt planet-hero-visual__belt--back" />
        <div className="planet-hero-visual__dust planet-hero-visual__dust--back" />

        <div className="planet-hero-visual__figure-glow" />
        <Image
          className="planet-hero-visual__figure"
          src={FIGURE_SRC}
          alt=""
          width={268}
          height={720}
          unoptimized
          draggable={false}
        />

        <div className="planet-hero-visual__planet-shell">
          <Image
            className="planet-hero-visual__planet"
            src={planetSrc}
            alt=""
            fill
            priority
            sizes="(min-width: 1120px) 420px, (min-width: 720px) 330px, 260px"
            unoptimized
            draggable={false}
            onError={() => {
              if (planetSrc !== PLANET_FALLBACK_SRC) {
                setPlanetSrc(PLANET_FALLBACK_SRC);
              }
            }}
          />
          <div className="planet-hero-visual__terminator" />
          <div className="planet-hero-visual__atmosphere" />
        </div>

        <div className="planet-hero-visual__belt planet-hero-visual__belt--front" />
        <div className="planet-hero-visual__dust planet-hero-visual__dust--front" />
      </div>
    </div>
  );
}
