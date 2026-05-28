import type * as React from "react";
import { cn } from "@/lib/utils";

const particles = [
  { x: "8%", y: "18%", s: "2px", d: "18s", o: 0.42 },
  { x: "17%", y: "72%", s: "1px", d: "24s", o: 0.3 },
  { x: "28%", y: "34%", s: "1.5px", d: "21s", o: 0.34 },
  { x: "39%", y: "84%", s: "2px", d: "27s", o: 0.26 },
  { x: "52%", y: "16%", s: "1px", d: "20s", o: 0.32 },
  { x: "64%", y: "68%", s: "1.5px", d: "25s", o: 0.38 },
  { x: "76%", y: "28%", s: "2px", d: "23s", o: 0.34 },
  { x: "88%", y: "58%", s: "1px", d: "19s", o: 0.28 },
  { x: "94%", y: "12%", s: "1.5px", d: "30s", o: 0.24 },
];

export function AtmosphericBackground({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn("echo-atmosphere", className)} aria-hidden="true">
      <div className="echo-atmosphere__base" />
      <div className="echo-atmosphere__glow echo-atmosphere__glow--amber" />
      <div className="echo-atmosphere__glow echo-atmosphere__glow--rose" />
      <div className="echo-atmosphere__glow echo-atmosphere__glow--wine" />
      <div className="echo-atmosphere__noise" />
      <div className="echo-atmosphere__particles">
        {particles.map((particle, index) => (
          <span
            key={`${particle.x}-${particle.y}`}
            className="echo-atmosphere__particle"
            style={
              {
                "--particle-x": particle.x,
                "--particle-y": particle.y,
                "--particle-size": particle.s,
                "--particle-duration": particle.d,
                "--particle-opacity": particle.o,
                "--particle-delay": `${index * -2.7}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}
