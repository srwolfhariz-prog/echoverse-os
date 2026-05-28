<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Rules

## Project Name

平行宇宙的回声 / Echoverse

## Product Feeling

The product should feel warm, healing, mysterious, introspective, gently cosmic, and like a mature commercial app.

## Visual Restrictions

1. Do not create a PPT-style interface.
2. Do not use cheap oversized gradients.
3. Do not create a default-template feeling.
4. Do not use generic SaaS blue-purple tech styling.
5. Do not stack large flat solid-color cards.
6. Do not add excessive glow effects casually.
7. Do not allow horizontal overflow on mobile.
8. Do not break existing functionality for visual polish.

## Design Rules

1. Design mobile-first.
2. Backgrounds must have layered depth: base color, soft glow, noise, and a small amount of particles.
3. Cards should use refined glassmorphism, but must not become overly transparent.
4. Buttons must have touch feedback.
5. Motion should be restrained, smooth, and breathing-like.
6. All complex visuals must be componentized.
7. Colors, radii, shadows, and motion durations should be extracted into tokens where practical.
8. Put new components in sensible directories. Do not pile all code into page files.

## Technical Rules

1. Prefer React / Next.js / TypeScript.
2. Prefer Tailwind for styling.
3. Prefer shadcn/ui for foundational UI.
4. Prefer `motion/react` for motion.
5. Prefer Lottie, Spline, or Rive for complex animation. Do not hand-code low-quality complex animation.
6. After each change, run lint/build checks when practical.
7. After completion, summarize changed files and recommended next steps.
