# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A two-sided product; both sides weigh equally.

- **Founders and community leads** who publish a project (an early-stage startup or a community) and want to assemble the people who will build it with them. Their job: describe what they are building and who they need, review who asks to join, and choose who gets in.
- **People looking for a team**: developers, designers, product, marketing and sales people, data people, would-be cofounders, mentors, investors and beta testers who want to join a project. Their job: find a project worth their time, ask to join, and start collaborating once accepted.

## Product Purpose

Clyro is where startups and communities find their people. A project goes public with its category, stage, tagline, cover and the roles it is looking for. Anyone can browse and search the showcase and request access by answering the project's entry form. The owner sees the requester's profile and answers and approves or declines. Approved people land inside the project's workspace.

Success means a project leaves Clyro with a working team, and a person finds a project they actually join and stay in.

## Positioning

**Showcase and workspace in one place.** The page where you discover a project becomes the room where its team works: teams, text channels, voice rooms, video calls and screen sharing. A job board stops at the application, and a chat tool starts after the team already exists. Clyro covers both the finding and the working.

## Operating Context

- Discovery: the home page (`/`) is a public showcase with search, category filters, category bands and recently published projects. Each project has a public page (`/p/$projectId`).
- Joining: a person can be in any number of projects. Membership comes through an approved access request, an invite or an invite code; nobody can add themselves directly.
- Working: the signed-in app (`/app`) is the workspace, built on Discord-style structure: a rail of workspaces, teams, text and voice channels, direct messages, presence status, voice/video calls and screen sharing over WebRTC.
- Categories: SaaS, IA, Fintech, Saúde, Educação, Marketplace, Games, Impacto, Comunidade.
- Stages: Ideia, MVP, Beta, Tração, Escala.
- Roles a project can look for: Cofounder, Dev, Design, Produto, Marketing, Vendas, Dados, Investidor, Mentor, Beta testers, Comunidade.

## Capabilities and Constraints

- Stack: TanStack Start + React, Tailwind CSS v4, Radix/shadcn components, Supabase (auth, Postgres with row-level security, realtime, storage), WebRTC for voice/video/screen.
- The repository syncs with Lovable (see AGENTS.md): no rewriting published git history, and the connected branch must stay working.
- The interface is currently written in Brazilian Portuguese. Whether other languages come later is undecided.
- Product vocabulary: "projeto" (a published workspace; the `servers` table), "pedido de acesso" (access request), "formulário de entrada" (the project's entry questions), "comunidade" / "workspace" (where an approved team works).

## Brand Commitments

- Name: **Clyro**, written in lowercase in the wordmark ("clyro").
- **The orange glass mascot is the identity and stays.** Six poses live in `public/mascot/`: `neutro`, `energia`, `estrela`, `chuva`, `sorte`, `brincando`, plus `logo.png`. Each pose marks a moment: empty states, achievements, invites, loading.

## Evidence on Hand

- Real product data comes only from published projects in the database. Today there may be none, and the home page must read honestly with zero projects.
- There are no testimonials, customer logos, user counts, press, ratings or case studies. Future work must not fabricate any of them.

## Product Principles

1. **Finding and working are one journey.** Every surface should make the path from discovering a project to working inside it feel continuous, never like two products stitched together.
2. **Both sides are first-class.** Every discovery surface should speak to the founder publishing and the person looking at the same time, with neither one as an afterthought.
3. **The owner decides who enters.** Access is a deliberate choice made from the person's profile and answers, never a self-serve join.
4. **Honest with an empty room.** Show real projects and real numbers, including zero, and invite people to be the first rather than faking activity.
5. **The mascot carries the warmth.** Personality comes from the mascot and its poses, so the rest of the interface can stay precise.
