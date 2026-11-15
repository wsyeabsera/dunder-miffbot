# Dunder Miffbot: ideas (draft, parked until The Mailroom slice 1 is used)

Status: brainstorming. No code.

## What it is

A Cloudflare-deployed personal app, an office of AI employees with a UI where they live and are managed. Funny company name; the tone is office comedy (memos, a lounge, performance reviews).

## Employees

- Doers, not just advisers: they work on tasks, run deployed projects, and act while Yab is away.
- **Personalities, not job titles.** An employee is a personality plus a brain. Jobs are handed out per task.
- Each employee has a brain: vector memory (remember, recall, forget), one namespace per employee.
- Starting pair: two contrasting personalities so tests show a difference. Yab has not described them yet. **?**

## Brains and cost

- Slice 1 runs free: Cloudflare Workers + cron triggers + Durable Object SQLite + Vectorize + Workers AI. Check current free limits in the dashboard.
- Model is one setting per employee: Workers AI (free) first; Anthropic API later (pay per use); or local Claude through The Mailroom.
- A daily allowance meter per employee; an employee that runs out rests until tomorrow.
- No LangChain at first: Vectorize + the Anthropic SDK tool loop + plain functions. Revisit only if something specific needs it.

## Verifying employees

Vectors give memory, not proof. Proof is tests for employees:

- A task is stored as a replayable scenario.
- Checks: hard rules (cites 3 sources, under the allowance) and a judge model with a rubric.
- Rerun after changing a personality or memory and compare scores.
- Yab can rate real work; ratings become each employee's record.
- Look at `lite`'s `scenarios.ts`, `tournament.ts`, `review.ts` first; they may already be this shape.

## Local Claude

Through The Mailroom, as a tool (`ask_local_claude`): a cheap employee delegates hard work to it, or an employee uses it as their whole brain.

## Investing employee (later, with rails)

For the AI-assisted stocks and crypto adviser idea.

- Paper trading only at the start.
- Any real exchange key is trade-only, no withdrawals.
- Position-size and daily-loss caps enforced in code the model cannot edit.
- Moving money always needs Yab's approval.
- "Conscious" is read as persistent memory, goals and a track record it learns from.

## Slices

1. Foundation: login (copied from `lite`), roster UI, employees with personality and memory, one scheduled job.
2. Laptop bridge client (needs The Mailroom).
3. Cloud hands: research and read-only cloud access.
4. Investing employee, paper trading.

## Name

Dunder Miffbot, repo `dunder-miffbot`.
